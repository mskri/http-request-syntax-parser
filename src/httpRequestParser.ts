import { EOL } from 'os';
import * as http from 'http';

const DEFAULT_METHOD = 'GET';
const DEFAULT_VERSION = 'HTTP/1.1';

// To match long request-line that has been split by either `/`, `?` or `&`.
// Matches lines starting with 0 or more whitespace followed by `&`, `?` or `/`
const LONG_REQUEST_LINE_BREAK_PREFIX = /^\s*[&\?/]/;

// Matches double forward slashes
const COMMENT_LINE_PREFIX = /^\/\/\s*/;

// Matches strings starting with method followed by one whitespace
const REQUEST_LINE_PREFIX = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)\s/;

// https://www.rfc-editor.org/rfc/rfc9110.html#name-protocol-version
// Matches one whitespace followed by `HTTP/`, followed by one or more (any) character,
// followed by line end
const HTTP_VERSION = /\s+HTTP\/.*$/;

// https://www.rfc-editor.org/rfc/rfc9110.html#name-field-names
const HEADER_LINE_FIELD_NAME = /^[a-zA-Z-_]+$/;

// https://www.rfc-editor.org/rfc/rfc9110.html#name-field-values
const HEADER_LINE_FIELD_VALUE = /^[a-zA-Z0-9_ :;.,\\\/"'?!(){}[\]@<>=\-+*#$&`|~^%]*$/;

enum ParseState {
  Comment,
  RequestLine,
  Header,
  Body,
}

// https://www.rfc-editor.org/rfc/rfc9110.html#name-methods
const methods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE'] as const;
type Method = typeof methods[number];

export type HttpRequest = {
  method: Method;
  pathname: string;
  uri: string;
  version: string;
  headers: Headers;
  body: string | undefined;
};

type RequestLine = Pick<HttpRequest, 'method' | 'pathname' | 'uri' | 'version'>;

type Headers = http.OutgoingHttpHeaders;

type HeaderValue = http.OutgoingHttpHeader | undefined;

/**
 * Parses HTTP request from string into object.
 *
 * HTTP request format follows:
 *   - https://www.rfc-editor.org/rfc/rfc9110.html
 *   - https://www.rfc-editor.org/rfc/rfc2616#section-5
 *   - https://www.jetbrains.com/help/phpstorm/exploring-http-syntax.html
 *
 * @param {string} message HTTP request message string to parse.
 * @returns {HttpRequest} HTTP request message parsed into object.
 * @throws {HttpParseError} Parse error.
 */
export function parseHttpRequest(message: string): HttpRequest {
  const lines: string[] = message.split(EOL);
  const requestLines: string[] = [];
  const headersLines: string[] = [];
  const bodyLines: string[] = [];

  let state = ParseState.RequestLine;
  let currentLine: string | undefined;
  let prevState: ParseState | null = null;

  while ((currentLine = lines.shift()?.trim()) !== undefined) {
    const nextLine: string | undefined = lines[0]?.trim();

    if (COMMENT_LINE_PREFIX.test(currentLine)) {
      prevState = state;
      state = ParseState.Comment;
    }

    switch (state) {
      case ParseState.Comment:
        if (!COMMENT_LINE_PREFIX.test(nextLine)) {
          state = prevState ?? ParseState.RequestLine;
          prevState = null;
        }
        // Do nothing for comment line
        break;
      case ParseState.RequestLine:
        requestLines.push(currentLine);

        const isRequestSplitIntoMultipleLines = LONG_REQUEST_LINE_BREAK_PREFIX.test(nextLine);
        if (nextLine === undefined || isRequestSplitIntoMultipleLines) {
          // Request has only request-line or request-line is broken into multiple lines
          break;
        }

        if (nextLine) {
          state = ParseState.Header;
        } else {
          // Next line is blank which indicates starts of body. Remove the blank line and
          // continue parsing body
          lines.shift();
          state = ParseState.Body;
        }

        break;
      case ParseState.Header:
        headersLines.push(currentLine);

        if (!nextLine) {
          // Next line is blank which indicates starts of body. Remove the blank line and
          // continue parsing body
          lines.shift();
          state = ParseState.Body;
        }

        break;
      case ParseState.Body:
        bodyLines.push(currentLine);
        break;
    }
  }

  const headers = parseHeaders(headersLines);
  const host = getHeader(headers, 'host');

  const rawRequestLine = requestLines.map((line) => line.trim()).join('');
  const requestLine = parseRequestLine(rawRequestLine, host);

  const contentType = getHeader(headers, 'content-type');
  const body = parseBody(bodyLines, contentType);

  return {
    ...requestLine,
    headers,
    body,
  };
}

/**
 * Parse request-line into object.
 *
 * Request-line format:
 *   Request-Line = Method SP Request-URI SP HTTP-Version CRLF
 *
 * @param {string} line Request-line string to parse.
 * @returns {RequestLine} Request-line object.
 */
function parseRequestLine(line: string, host: HeaderValue): RequestLine {
  let method: Method;
  let requestUri: string;
  let pathname: string;
  let uri: string;
  let version: string;

  let match: RegExpExecArray | null;
  if ((match = REQUEST_LINE_PREFIX.exec(line))) {
    // We can be sure that method matched here is one of the allowed ones because of the regexp exec
    // Note: Of course if `methods` array and regexp are not in sync it can be something else...
    method = match[1] as Method;
    requestUri = line.substring(match[0].length);
  } else {
    method = DEFAULT_METHOD;
    requestUri = line;
  }

  requestUri = requestUri.trim();

  // Remove HTTP version from requestUri
  if ((match = HTTP_VERSION.exec(requestUri))) {
    version = match[0].trim();
    requestUri = requestUri.substring(0, match.index);
  } else {
    version = DEFAULT_VERSION;
  }

  try {
    const { href, pathname: path, search } = new URL(requestUri);
    pathname = path + search;
    uri = href;
  } catch (_) {
    pathname = requestUri;

    // If host header is set and URL is relative path change it to absolute URL
    if (host && requestUri.startsWith('/')) {
      const [, port] = host.toString().split(':') as (string | undefined)[];
      const scheme = port === '443' || port === '8443' ? 'https' : 'http';
      const hostWithoutPort = host.toString().replace(/:(443|8443|80)$/, '');
      uri = `${scheme}://${hostWithoutPort}${pathname}`;
    } else {
      throw new HttpParseError('Host header is required for relative URI');
    }
  }

  return {
    method,
    pathname,
    uri,
    version,
  };
}

/**
 * Parse header lines into headers.
 *
 * Header line format:
 *  field-name = field-value
 *
 * @param {Array<string>} headerLines Headers parsed into a array
 * @returns {Headers} Parsed headers
 */
function parseHeaders(headerLines: string[]): Headers {
  // message-header = field-name ":" [ field-value ]
  const headers: Headers = {};
  const headerNames: { [key: string]: string } = {};

  headerLines.forEach((headerLine) => {
    const [name, ...rest] = headerLine.split(':');
    const fieldName: string = name;
    const fieldValue: string = rest.join(':').trim();

    if (!HEADER_LINE_FIELD_NAME.test(fieldName)) {
      throw new HttpParseError('Header field-name is not valid');
    }

    if (!HEADER_LINE_FIELD_VALUE.test(fieldValue)) {
      throw new HttpParseError('Header field-value is not valid');
    }

    const normalizedFieldName = fieldName.toLowerCase();

    // Checking existing normalized field-name because repeated headers should be concatenated in a
    // list where values are separated by comma. Cookie values are separated by semicolon.
    // https://www.rfc-editor.org/rfc/rfc9110.html#name-field-lines-and-combined-fi
    const headerName = headerNames[normalizedFieldName];
    if (!headerName) {
      headerNames[normalizedFieldName] = fieldName;
      headers[fieldName] = fieldValue;
    } else {
      const headerName = headerNames[normalizedFieldName];
      const separator = normalizedFieldName === 'cookie' ? ';' : ',';
      const value = headers[headerName]?.toString();
      const existingValues = value?.split(separator)?.map((v) => v.trim()) ?? [];
      headers[headerName] = [...existingValues, fieldValue].join(`${separator} `);
    }
  });

  return headers;
}

function parseBody(lines: string[], contentType: HeaderValue): string | undefined {
  if (lines.length === 0) {
    return undefined;
  }

  if (lines.length > 0 && contentType == undefined) {
    throw new HttpParseError('No Content-Type header set for body');
  }

  return lines.join(' ').trim();
}

function getHeader(headers: Headers, name: string): HeaderValue {
  if (!headers || !name) {
    return undefined;
  }

  const headerName = Object.keys(headers).find(
    (header) => header.toLowerCase() === name.toLowerCase(),
  );

  return headerName && headers[headerName];
}

export class HttpParseError extends Error {
  constructor(message: string) {
    super();
    this.name = 'HttpParseError';
    this.message = message;
  }
}

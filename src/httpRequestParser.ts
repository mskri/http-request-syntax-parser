import { EOL } from 'os';
import * as http from 'http';

const DEFAULT_METHOD = 'GET';
const defaultVersion = 'HTTP/1.1';

// To match long request-line that has been split by either `/`, `?` or `&`.
// Matches lines starting with 0 or more whitespace followed by `&`, `?` or `/`
const LONG_REQUEST_LINE_BREAK_PREFIX = /^\s*[&\?/]/;

// https://www.rfc-editor.org/rfc/rfc9110.html#name-field-names
const HEADER_LINE_FIELD_NAME = /^[a-zA-Z-_]+$/;

// https://www.rfc-editor.org/rfc/rfc9110.html#name-field-values
const HEADER_LINE_FIELD_VALUE = /^[a-zA-Z0-9_ :;.,\\\/"'?!(){}[\]@<>=\-+*#$&`|~^%]*$/;
enum ParseState {
  RequestLine,
  Header,
  Body,
}

// https://www.rfc-editor.org/rfc/rfc9110.html#name-methods
const methods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE'] as const;
type Method = typeof methods[number];

type HttpRequest = {
  method: Method;
  pathname: string;
  headers: Headers;
};

type Headers = http.OutgoingHttpHeaders;

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

  let rawRequestLine: string = '';
  const headersLines: string[] = [];
  const bodyLines: string[] = [];

  let state = ParseState.RequestLine;
  let currentLine: string | undefined;

  while ((currentLine = lines.shift()?.trim()) !== undefined) {
    const nextLine: string | undefined = lines[0]?.trim();

    switch (state) {
      case ParseState.RequestLine:
        rawRequestLine = currentLine;

        const isRequestSplitIntoMultipleLines = LONG_REQUEST_LINE_BREAK_PREFIX.test(nextLine);
        if (nextLine === undefined || isRequestSplitIntoMultipleLines) {
          // Request has only request-line
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

  return {
    method: 'CONNECT',
    pathname: 'placeholder',
    headers,
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

export class HttpParseError extends Error {
  constructor(message: string) {
    super();
    this.name = 'HttpParseError';
    this.message = message;
  }
}

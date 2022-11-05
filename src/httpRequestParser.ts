import { EOL } from 'os';

const DEFAULT_METHOD = 'GET';
const defaultVersion = 'HTTP/1.1';

// To match long request-line that has been split by either `/`, `?` or `&`.
// Matches lines starting with 0 or more whitespace followed by `&`, `?` or `/`
const LONG_REQUEST_LINE_BREAK_PREFIX = /^\s*[&\?/]/;

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
};

type RequestLine = {
  method: Method;
  url: string;
};

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

  return {
    method: 'CONNECT',
    pathname: 'placeholder',
  };
}

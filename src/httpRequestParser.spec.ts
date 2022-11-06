import dedent from 'ts-dedent';
import { it, describe, expect } from 'vitest';
import { HttpParseError, HttpRequest, parseHttpRequest } from './httpRequestParser';

describe('parseHttpRequest', () => {
  it("should throw error when request doesn't start with request-line", () => {
    const message = dedent`
    Host: example.com
    GET /api/path`;

    expect(() => parseHttpRequest(message)).toThrowError(HttpParseError);
    expect(() => parseHttpRequest(message)).toThrowError(/Request-line not starting with method/);
  });

  it('should parse request-line', () => {
    const message = 'GET https://mursu.dev/api/path';

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {},
      method: 'GET',
      pathname: '/api/path',
      uri: 'https://mursu.dev/api/path',
      version: 'HTTP/1.1',
    });
  });

  it('should parse request-line broken into multiple lines', () => {
    const message = dedent`
    GET https://mursu.dev
        /path
        /to
        /endpoint
        ?query=asd
        &filter=false`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {},
      method: 'GET',
      pathname: '/path/to/endpoint?query=asd&filter=false',
      uri: 'https://mursu.dev/path/to/endpoint?query=asd&filter=false',
      version: 'HTTP/1.1',
    });
  });

  it('should parse request-line with query strings', () => {
    const message = 'GET https://mursu.dev/path/to/endpoint?query=12345&filter=true';

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {},
      method: 'GET',
      pathname: '/path/to/endpoint?query=12345&filter=true',
      uri: 'https://mursu.dev/path/to/endpoint?query=12345&filter=true',
      version: 'HTTP/1.1',
    });
  });

  it('should parse relative uri with host header to https protocol when host header has no port', () => {
    const message = dedent`
    GET /path/to/endpoint
    Host: example.com`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Host: 'example.com',
      },
      method: 'GET',
      pathname: '/path/to/endpoint',
      uri: 'http://example.com/path/to/endpoint',
      version: 'HTTP/1.1',
    });
  });

  it('should parse uri to https when port is 443 or 8443', () => {
    const message1 = dedent`
    GET /path/to/endpoint
    Host: example.com:443`;

    const message2 = dedent`
    GET /path/to/endpoint
    Host: example.com:8443`;

    expect(parseHttpRequest(message1)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Host: 'example.com:443',
      },
      method: 'GET',
      pathname: '/path/to/endpoint',
      uri: 'https://example.com/path/to/endpoint',
      version: 'HTTP/1.1',
    });

    expect(parseHttpRequest(message2)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Host: 'example.com:8443',
      },
      method: 'GET',
      pathname: '/path/to/endpoint',
      uri: 'https://example.com/path/to/endpoint',
      version: 'HTTP/1.1',
    });
  });

  it('should parse uri to http when port is not 443 or 8443', () => {
    const message1 = dedent`
    GET /path/to/endpoint
    Host: example.com:1234`;

    expect(parseHttpRequest(message1)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Host: 'example.com:1234',
      },
      method: 'GET',
      pathname: '/path/to/endpoint',
      uri: 'http://example.com:1234/path/to/endpoint',
      version: 'HTTP/1.1',
    });
  });

  it('should parse uri to http when port is 80', () => {
    const message1 = dedent`
    GET /path/to/endpoint
    Host: example.com:80`;

    expect(parseHttpRequest(message1)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Host: 'example.com:80',
      },
      method: 'GET',
      pathname: '/path/to/endpoint',
      uri: 'http://example.com/path/to/endpoint',
      version: 'HTTP/1.1',
    });
  });

  it('should parse request when HTTP version is not set', () => {
    const message = dedent`
    GET /api/path
    Host: 127.0.0.1:8000`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Host: '127.0.0.1:8000',
      },
      method: 'GET',
      pathname: '/api/path',
      uri: 'http://127.0.0.1:8000/api/path',
      version: 'HTTP/1.1',
    });
  });

  it('should parse request when HTTP version is set', () => {
    const message = dedent`
    GET /api/path HTTP/1.1
    Host: 127.0.0.1:8000`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Host: '127.0.0.1:8000',
      },
      method: 'GET',
      pathname: '/api/path',
      uri: 'http://127.0.0.1:8000/api/path',
      version: 'HTTP/1.1',
    });
  });

  it('should parse example message exchange', () => {
    const message = dedent`
    GET /api/path
    Host: 127.0.0.1:8000`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Host: '127.0.0.1:8000',
      },
      method: 'GET',
      pathname: '/api/path',
      uri: 'http://127.0.0.1:8000/api/path',
      version: 'HTTP/1.1',
    });
  });

  it('should parse header', () => {
    const message = dedent`
    GET https://mursu.dev/api/path
    api-key: 12345`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        'api-key': '12345',
      },
      method: 'GET',
      pathname: '/api/path',
      uri: 'https://mursu.dev/api/path',
      version: 'HTTP/1.1',
    });
  });

  it('should parse relative url when host header is set', () => {
    const message = dedent`
    GET /api/path
    Host: mursu.dev`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Host: 'mursu.dev',
      },
      method: 'GET',
      pathname: '/api/path',
      uri: 'http://mursu.dev/api/path',
      version: 'HTTP/1.1',
    });
  });

  it('should throw parse error when parsing relative url without host header', () => {
    const message = dedent`
    GET /api/path`;

    expect(() => parseHttpRequest(message)).toThrowError(HttpParseError);
    expect(() => parseHttpRequest(message)).toThrowError(
      /Host header is required for relative URI/,
    );
  });

  it('should parse header without value', () => {
    const message = dedent`
    GET http://mursu.dev/api/path
    Example-Field:`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        'Example-Field': '',
      },
      method: 'GET',
      pathname: '/api/path',
      uri: 'http://mursu.dev/api/path',
      version: 'HTTP/1.1',
    });
  });

  it('should parse concatenate repeated header into list separated by comma', () => {
    const message = dedent`
    GET http://mursu.dev/api/path
    Example-Field: Foo, Bar
    Example-Field: Baz`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        'Example-Field': 'Foo, Bar, Baz',
      },
      method: 'GET',
      pathname: '/api/path',
      uri: 'http://mursu.dev/api/path',
      version: 'HTTP/1.1',
    });
  });

  it('should parse concatenate repeated cookie header into list separated by semicolon', () => {
    const message = dedent`
    GET http://mursu.dev/api/path
    Cookie: name=value
    Cookie: name2=value2`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: undefined,
      headers: {
        Cookie: 'name=value; name2=value2',
      },
      method: 'GET',
      pathname: '/api/path',
      uri: 'http://mursu.dev/api/path',
      version: 'HTTP/1.1',
    });
  });

  it('should throw error when header field name is using non-ascii characters', () => {
    const message = dedent`
    GET http://mursu.dev/api/path
    ♫: Musical note`;

    expect(() => parseHttpRequest(message)).toThrowError(HttpParseError);
    expect(() => parseHttpRequest(message)).toThrowError(/Header field-name is not valid/);
  });

  it('should throw error when header field value is using non-ascii characters', () => {
    const message = dedent`
    GET http://mursu.dev/api/path
    Example-Field: ♫`;

    expect(() => parseHttpRequest(message)).toThrowError(HttpParseError);
    expect(() => parseHttpRequest(message)).toThrowError(/Header field-value is not valid/);
  });

  it('should parse single-line request body', () => {
    const message = dedent`
    POST http://mursu.dev/posts
    Content-Type: application/json

    { "foo": "bar" }`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: '{ "foo": "bar" }',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      pathname: '/posts',
      uri: 'http://mursu.dev/posts',
      version: 'HTTP/1.1',
    });
  });

  it('should parse multiline request body', () => {
    const message = dedent`
    POST http://mursu.dev/posts
    Content-Type: application/json

    {
      "foo": "bar",
      "bar": 123
    }`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: '{ "foo": "bar", "bar": 123 }',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      pathname: '/posts',
      uri: 'http://mursu.dev/posts',
      version: 'HTTP/1.1',
    });
  });

  it('should parse request body and examine the content to determine content-type when no content-type header', () => {
    const message = dedent`
    POST http://mursu.dev/posts

    { "foo": "bar" }`;

    expect(() => parseHttpRequest(message)).toThrowError(HttpParseError);
    expect(() => parseHttpRequest(message)).toThrowError(/No Content-Type header set for body/);
  });

  it('should parse ignore comment lines', () => {
    const message = dedent`
    // This is a comment
    POST http://mursu.dev/posts
    Content-Type: application/json
    // This is also a comment
    Example-Field: value

    {
      "foo": "bar",
      // Comments also work in body section
      "bar": 123
    }`;

    expect(parseHttpRequest(message)).toEqual<HttpRequest>({
      body: '{ "foo": "bar", "bar": 123 }',
      headers: {
        'Content-Type': 'application/json',
        'Example-Field': 'value',
      },
      method: 'POST',
      pathname: '/posts',
      uri: 'http://mursu.dev/posts',
      version: 'HTTP/1.1',
    });
  });
});

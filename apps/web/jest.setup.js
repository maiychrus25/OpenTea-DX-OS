// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

require('@testing-library/jest-dom');
if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(url, options = {}) {
      this.url = url;
      this.options = options;
    }
    async json() {
      return JSON.parse(this.options.body)
    }
  }
}
if (typeof Response === 'undefined') {
  global.Response = class Response {
    static json(data, init) {
      return {
        status: init?.status || 200,
        json: async () => data
      }
    }
  }
}

// Mock Server Actions that import ESM-only libraries (e.g. next-auth)
// This prevents "Cannot use import statement outside a module" in Jest.
jest.mock('@/app/actions/signout-action', () => ({
  signOutAction: jest.fn()
}))

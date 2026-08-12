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

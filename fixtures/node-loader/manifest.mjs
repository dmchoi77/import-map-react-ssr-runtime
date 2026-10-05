export default {
  imports: {
    '@mfe/file': {
      id: '@mfe/file',
      version: '1.0.0',
      client: 'https://cdn.example.com/file/client.js',
      server: './remote-file.mjs',
    },
    '@mfe/http': {
      id: '@mfe/http',
      version: '1.0.0',
      client: 'https://cdn.example.com/http/client.js',
      server: 'http://127.0.0.1:4180/remote-http.mjs',
    },
  },
};

'use strict';

const axios = require('axios');

const BASE_URL = process.env.PF_SCAFFOLD_BASE_URL
  ? process.env.PF_SCAFFOLD_BASE_URL
  : 'http://localhost:7001';

const request = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
});

request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    console.error(
      'Request failed:',
      error.response ? error.response.data : error.message
    );
    return Promise.reject(error);
  }
);

module.exports = request;

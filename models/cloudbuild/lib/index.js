'use strict';

const io = require('socket.io-client');
const log = require('@pf-scaffold/log');
const request = require('@pf-scaffold/request');
const get = require('lodash/get');
const inquirer = require('inquirer');

const WS_SERVER = 'http://localhost:7001';
const TIME_OUT = 5 * 60 * 1000;
const CONNECT_TIME_OUT = 5 * 1000;

const FAILED_CODE = [
  'prepare failed',
  'download failed',
  'install failed',
  'build failed',
  'pre-publish failed',
  'publish failed',
];

class CloudBuild {
  constructor(git, options) {}
}

module.exports = CloudBuild;

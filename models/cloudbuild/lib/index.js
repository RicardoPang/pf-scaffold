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

function parseMsg(msg) {
  const action = get(msg, 'data action');
  const message = get(msg, 'data.payload.message');
  return {
    action,
    message,
  };
}

class CloudBuild {
  constructor(git, options) {
    this.git = git;
    this.buildCmd = options.buildCmd;
    this.timeout = TIME_OUT;
    this.prod = options.prod;
  }

  doTimeout(fn, timeout) {
    this.timer && clearTimeout(this.timer);
    log.info('设置任务超时时间: ', `${timeout / 1000}秒`);
    this.timer = setTimeout(fn, timeout);
  }

  init() {
    return new Promise((resolve, reject) => {
      console.log(
        this.git.remote,
        this.git.name,
        this.git.branch,
        this.git.version
      );
      const socket = io(WS_SERVER, {
        query: {
          repo: this.git.remote,
          name: this.git.name,
          branch: this.git.branch,
          version: this.git.version,
          buildCmd: this.buildCmd,
          prod: this.prod,
        },
      });
      socket.on('connect', () => {
        clearTimeout(this.timer);
        const { id } = socket;
        log.success('云构建任务创建成功', `任务ID: ${id}`);
        socket.on(id, (msg) => {
          const parsedMsg = parseMsg(msg);
          log.success(parsedMsg.action, parsedMsg.message);
        });
        resolve();
      });
      const disconnect = () => {
        clearTimeout(this.timer);
        socket.disconnect();
        socket.close();
      };
      this.doTimeout(() => {
        log.error('云构建服务连接超时, 自动终止');
        disconnect();
      }, CONNECT_TIME_OUT);
      socket.on('disconnect', () => {
        log.success('disconnect', '云构建任务已断开');
        disconnect();
      });
      socket.on('error', (err) => {
        log.error('error', '云构建出错', err);
        disconnect();
      });
      this.socket = socket;
    });
  }

  build() {
    let ret = true;
    return new Promise((resolve, reject) => {
      this.socket.emit('build');
      this.socket.on('build', (msg) => {
        const parsedMsg = parseMsg(msg);
        if (FAILED_CODE.indexOf(parseMsg.action) >= 0) {
          log.err(parseMsg.action, parseMsg.message);
          clearTimeout(this.timer);
          this.socket.disconnect();
          this.socket.close();
          ret = false;
        } else {
          log.success(parsedMsg.action, parsedMsg.message);
        }
      });
      this.socket.on('building', (msg) => {
        console.log(msg);
      });
      this.socket.on('disconnect', () => {
        resolve(ret);
      });
      this.socket.on('error', (err) => {
        reject(err);
      });
    });
  }
}

// 测试WebSocket
// const socket = require('socket.io-client')('http://127.0.0.1:7001');

// socket.on('connect', () => {
//   console.log('connect!');
//   socket.emit('chat', 'hello RicardoPangJ!');
// });

// socket.on('res', (msg) => {
//   console.log('res from server: %s!', msg);
// });

module.exports = CloudBuild;

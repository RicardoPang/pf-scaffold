'use strict';

const path = require('path');
const inquirer = require('inquirer');
const fse = require('fs-extra');
const glob = require('glob');
const ejs = require('ejs');
const semver = require('semver');
const userHome = require('user-home');
const Command = require('@pf-scaffold/command');
const Package = require('@pf-scaffold/package');
const log = require('@pf-scaffold/log');
const { spinnerStart, sleep, execAsync } = require('@pf-scaffold/utils');

const getProjectTemplate = require('./getProjectTemplate');

class InitCommand extends Command {
  init() {
    this.projectName = this._argv[0] || '';
    console.log(this._cmd);
    this.force = !!this._cmd.force;
    log.verbose('projectName', this.projectName);
    log.verbose('force', this.force);
  }

  async exec() {}
}

function init(argv) {
  log.verbose('argv', argv);
  return new InitCommand(argv);
}

module.exports = init;
module.exports.InitCommand = InitCommand;

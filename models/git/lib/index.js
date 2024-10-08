'use strict';

const fs = require('fs');
const path = require('path');
const SimpleGit = require('simple-git');
const fse = require('fs-extra');
const userHome = require('user-home');
const inquirer = require('inquirer');
const terminalLink = require('terminal-link');
const semver = require('semver');
const Listr = require('listr');
const { Observable } = require('rxjs');
const log = require('@pf-scaffold/log');
const { readFile, writeFile, spinnerStart } = require('@pf-scaffold/utils');
const request = require('@pf-scaffold/request');
const CloudBuild = require('@pf-scaffold/cloudbuild');
const Github = require('./Github');
const Gitee = require('./Gitee');
const ComponentRequest = require('./ComponentRequest');

const DEFAULT_CLI_HOME = '.pf-scaffold';
const GIT_ROOT_DIR = '.git';
const GIT_SERVER_FILE = '.git_server';
const GIT_TOKEN_FILE = '.git_token';
const GIT_OWN_FILE = '.git_own';
const GIT_LOGIN_FILE = '.git_login';
const GIT_IGNORE_FILE = '.gitignore';
const GIT_PUBLISH_FILE = '.git_publish';
const GITHUB = 'github';
const GITEE = 'gitee';
const REPO_OWNER_USER = 'user';
const REPO_OWNER_ORG = 'org';
const VERSION_RELEASE = 'release';
const VERSION_DEVELOP = 'dev';
const TEMPLATE_TEMP_DIR = 'oss';
const COMPONENT_FILE = '.componentrc';

const GIT_SERVER_TYPE = [
  {
    name: 'Github',
    value: GITHUB,
  },
  {
    name: 'Gitee',
    value: GITEE,
  },
];

const GIT_OWNER_TYPE = [
  {
    name: '个人',
    value: REPO_OWNER_USER,
  },
  {
    name: '组织',
    value: REPO_OWNER_ORG,
  },
];

const GIT_OWNER_TYPE_ONLY = [
  {
    name: '个人',
    value: REPO_OWNER_USER,
  },
];

const GIT_PUBLISH_TYPE = [
  {
    name: 'OSS',
    value: 'oss',
  },
];

class Git {
  constructor(
    { name, version, dir },
    {
      refreshServer = false,
      refreshToken = false,
      refreshOwner = false,
      buildCmd = '',
      prod = false,
      sshUser = '',
      sshIp = '',
      sshPath = '',
    }
  ) {
    if (name.startsWith('@') && name.indexOf('/') > 0) {
      // @pf-scaffold/component-test => pf-scaffold_component-test
      const nameArray = name.split('/');
      this.name = nameArray.join('_').replace('@', '');
    } else {
      this.name = name; // 项目名称
    }
    this.version = version; // 项目版本
    this.dir = dir; // 源码目录
    this.git = SimpleGit(dir); // SimpleGit实例
    this.gitServer = null; // GitServer实例
    this.homePath = null; // 本地缓存目录
    this.user = null; // 用户信息
    this.orgs = null; // 用户所属组织列表
    this.owner = null; // 远程仓库类型
    this.login = null; // 远程仓库登录名
    this.repo = null; // 远程仓库信息
    this.refreshServer = refreshServer; // 是否强制刷新远程仓库
    this.refreshToken = refreshToken; // 是否强化刷新远程仓库token
    this.refreshOwner = refreshOwner; // 是否强化刷新远程仓库类型
    this.branch = null; // 本地开发分支
    this.buildCmd = buildCmd; // 构建命令
    this.gitPublish = null; // 静态资源服务器类型
    this.prod = prod; // 是否正式发布
    this.sshUser = sshUser;
    this.sshIp = sshIp;
    this.sshPath = sshPath;
    log.verbose('ssh config', this.sshUser, this.sshIp, this.sshPath);
  }

  async prepare() {
    this.checkHomePath(); // 检查缓存主目录
    await this.checkGitServer(); // 检查用户远程仓库类型
    await this.checkGitToken(); // 获取远程仓库Token
    await this.getUserAndOrgs(); // 获取远程仓库用户和组织信息
    await this.checkGitOwner(); // 确认远程仓库类型
    await this.checkRepo(); // 检查并创建远程仓库
    this.checkGitIgnore(); // 检查并创建.gitignore文件
    await this.checkComponent(); // 组件合法性检查
    await this.init(); // 完成本地仓库初始化
  }

  getPackageJson() {
    const pkgPath = path.resolve(this.dir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      throw new Error(`package.json 不存在！源码目录：${this.dir}`);
    }
    return fse.readJsonSync(pkgPath);
  }

  isComponent() {
    const componentFilePath = path.resolve(this.dir, COMPONENT_FILE);
    return (
      fs.existsSync(componentFilePath) && fse.readJsonSync(componentFilePath)
    );
  }

  async checkComponent() {
    let componentFile = this.isComponent();
    if (componentFile) {
      log.info('开始检查build结果');
      if (!this.buildCmd) {
        this.buildCmd = 'npm run build';
      }
      require('child_process').execSync(this.buildCmd, {
        cwd: this.dir,
      });
      const buildPath = path.resolve(this.dir, componentFile.buildPath);
      if (!fs.existsSync(buildPath)) {
        throw new Error(`构建结果: ${buildPath}不存在`);
      }
      const pkg = this.getPackageJson();
      if (!pkg.file || !pkg.files.includes(componentFile.buildPath)) {
        throw new Error(
          `package.json中files属性未添加构建结果目录：[${componentFile.buildPath}]，请在package.json中手动添加！`
        );
      }
      log.success('build结果检查通过！');
    }
  }

  async pushRemoteRepo(branchName) {
    await this.git.push('origin', branchName);
  }

  async pullRemoteRepo(branchName, options) {
    log.info(`同步远程${branchName}分支代码`);
    try {
      await this.git.pull('origin', branchName, options);
    } catch (err) {
      log.error(err.message);
      throw new Error('拉取远程分支失败'); // 抛出异常以便在调用处捕获
    }
  }

  async checkRemoteMaster() {
    return (
      (await this.git.listRemote(['--refs'])).indexOf('refs/heads/main') >= 0
    );
  }

  async checkNotCommitted() {
    const status = await this.git.status();
    if (
      status.not_added.length > 0 ||
      status.created.length > 0 ||
      status.deleted.length > 0 ||
      status.modified.length > 0 ||
      status.renamed.length > 0
    ) {
      log.verbose('status', status);
      await this.git.add('.');
      let message;
      while (!message) {
        message = (
          await inquirer.prompt({
            type: 'text',
            name: 'message',
            message: '请输入commit信息：',
          })
        ).message;
      }
      await this.git.commit(message);
      log.success('本次commit提交成功');
    }
  }

  async checkConflicted() {
    log.info('代码冲突检查');
    const status = await this.git.status();
    if (status.conflicted.length > 0) {
      throw new Error('当前代码存在冲突，请手动处理合并后再试！');
    }
    log.success('代码冲突检查通过');
  }

  async initCommit() {
    await this.checkConflicted();
    await this.checkNotCommitted();
    if (await this.checkRemoteMaster()) {
      try {
        // 首先获取远程分支的最新状态
        await this.git.fetch('origin');
        // 然后尝试合并，允许不相关的历史
        await this.git.merge(['origin/main', '--allow-unrelated-histories']);
      } catch (error) {
        log.error('拉取远程分支失败，尝试合并本地更改');
        log.error(error.message);
        // 如果合并失败，考虑重置本地分支
        await this.git.reset(['--hard', 'origin/main']);
      }
    } else {
      await this.pushRemoteRepo('main');
    }
  }

  async initAndAddRemote() {
    log.info('执行git初始化');
    await this.git.init(this.dir);
    log.info('添加git remote');
    const remotes = await this.git.getRemotes();
    log.verbose('git remotes', remotes);
    if (!remotes.find((item) => item.name === 'origin')) {
      await this.git.addRemote('origin', this.remote);
    }
  }

  getRemote() {
    const gitPath = path.resolve(this.dir, GIT_ROOT_DIR);
    this.remote = this.gitServer.getRemote(this.login, this.name);
    if (fs.existsSync(gitPath)) {
      log.success('git已完成初始化');
      return true;
    }
  }

  async init() {
    if (await this.getRemote()) {
      return;
    }
    await this.initAndAddRemote();
    await this.initCommit();
  }

  checkGitIgnore() {
    const gitIgnore = path.resolve(this.dir, GIT_IGNORE_FILE);
    if (!fs.existsSync(gitIgnore)) {
      writeFile(
        gitIgnore,
        `.DS_Store
node_modules
/dist


# local env files
.env.local
.env.*.local

# Log files
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Editor directories and files
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`
      );
      log.success(`自动写入${GIT_IGNORE_FILE}文件成功`);
    }
  }

  async checkRepo() {
    let repo = await this.gitServer.getRepo(this.login, this.name);
    if (!repo) {
      let spinner = spinnerStart('开始创建远程仓库...');
      try {
        if (this.owner === REPO_OWNER_USER) {
          repo = await this.gitServer.createRepo(this.name);
        } else {
          this.gitServer.createOrgRepo(this.name, this.login);
        }
      } catch (e) {
        log.error(e);
      } finally {
        spinner.stop(true);
      }
      if (repo) {
        log.success('远程仓库创建成功');
      } else {
        throw new Error('远程仓库创建失败');
      }
    } else {
      log.success('远程仓库信息获取成功');
    }
    log.verbose('repo', repo);
    this.repo = repo;
  }

  async checkGitOwner() {
    const ownerPath = this.createPath(GIT_OWN_FILE);
    const loginPath = this.createPath(GIT_LOGIN_FILE);
    let owner = readFile(ownerPath);
    let login = readFile(loginPath);
    if (!owner || !login || this.refreshOwner) {
      owner = (
        await inquirer.prompt({
          type: 'list',
          name: 'owner',
          message: '请选择远程仓库类型',
          default: REPO_OWNER_USER,
          choices: this.orgs.length > 0 ? GIT_OWNER_TYPE : GIT_OWNER_TYPE_ONLY,
        })
      ).owner;
      if (owner === REPO_OWNER_USER) {
        login = this.user.login;
      } else {
        login = (
          await inquirer.prompt({
            type: 'list',
            name: 'login',
            message: '请选择',
            choices: this.orgs.map((item) => ({
              name: item.login,
              value: item.login,
            })),
          })
        ).login;
      }
      writeFile(ownerPath, owner);
      writeFile(loginPath, login);
      log.success('owner写入成功', `${owner} -> ${ownerPath}`);
      log.success('login写入成功', `${login}-> ${loginPath}`);
    } else {
      log.success('owner获取成功', owner);
      log.success('login获取成功', login);
    }
    this.owner = owner;
    this.login = login;
  }

  async getUserAndOrgs() {
    this.user = await this.gitServer.getUser();
    if (!this.user) {
      throw new Error('用户信息获取失败');
    }
    log.verbose('user', this.user);
    this.orgs = await this.gitServer.getOrg(this.user.login);
    if (!this.orgs) {
      throw new Error('组织信息获取失败');
    }
    log.verbose('orgs', this.orgs);
    log.success(this.gitServer.type + ' 用户和组织信息获取成功');
  }

  async checkGitToken() {
    const tokenPath = this.createPath(GIT_TOKEN_FILE);
    let token = readFile(tokenPath);
    if (!token || this.refreshToken) {
      log.warn(
        this.gitServer.type + ' token未生成',
        '请先生成' +
          this.gitServer.type +
          ' token，' +
          terminalLink('链接', this.gitServer.getTokenUrl())
      );
      token = (
        await inquirer.prompt({
          type: 'password',
          name: 'token',
          message: '请将token复制到这里',
          default: '',
        })
      ).token;
      writeFile(tokenPath, token);
      log.success('token写入成功', `${token} -> ${tokenPath}`);
    } else {
      log.success('token获取成功', tokenPath);
    }
    this.token = token;
    this.gitServer.setToken(token);
  }

  createGitServer(gitServer = '') {
    if (gitServer === GITHUB) {
      return new Github();
    } else if (gitServer === GITEE) {
      return new Gitee();
    }
    return null;
  }

  createPath(file) {
    const rootDir = path.resolve(this.homePath, GIT_ROOT_DIR);
    const filePath = path.resolve(rootDir, file);
    fse.ensureDirSync(rootDir);
    return filePath;
  }

  async checkGitServer() {
    const gitServerPath = this.createPath(GIT_SERVER_FILE);
    let gitServer = readFile(gitServerPath);
    console.log(gitServerPath, gitServer);
    if (!gitServer || this.refreshServer) {
      gitServer = (
        await inquirer.prompt({
          type: 'list',
          name: 'gitServer',
          message: '请选择您想要托管的Git平台',
          default: GITHUB,
          choices: GIT_SERVER_TYPE,
        })
      ).gitServer;
      writeFile(gitServerPath, gitServer);
      log.success('git server写入成功', `${gitServer} -> ${gitServerPath}`);
    } else {
      log.success('git server获取成功', gitServer);
    }
    this.gitServer = this.createGitServer(gitServer);
    if (!this.gitServer) {
      throw new Error('GitServer初始化失败！');
    }
  }

  checkHomePath() {
    if (!this.homePath) {
      if (process.env.CLI_HOME_PATH) {
        this.homePath = process.env.CLI_HOME_PATH;
      } else {
        this.homePath = path.resolve(userHome, DEFAULT_CLI_HOME);
      }
    }
    log.verbose('home', this.homePath);
    fse.ensureDirSync(this.homePath);
    if (!fs.existsSync(this.homePath)) {
      throw new Error('用户主目录获取失败！');
    }
  }
}

module.exports = Git;

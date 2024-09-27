'use strict';

// 动态加载 命令抽象为Package
// 既可以通过缓存实时从npm下载, 也可以从本地映射命令
// 输出入口文件地址rootFile

const path = require('path');
const fse = require('fs-extra');
const pkgDir = require('pkg-dir').sync;
const pathExists = require('path-exists').sync;
const npminstall = require('npminstall');
const { isObject } = require('@pf-scaffold/utils');
const formatPath = require('@pf-scaffold/format-path');
const {
  getDefaultRegistry,
  getNpmLatestVersion,
} = require('@pf-scaffold/get-npm-info');

class Package {
  constructor(options) {
    if (!options) {
      throw new Error('Package类的options参数不能为空');
    }
    if (!isObject(options)) {
      throw new Error('Package类的options参数必须为对象');
    }
    // package路径
    this.targetPath = options.targetPath;
    // package存储路径
    this.storeDir = options.storeDir;
    // package的name
    this.packageName = options.packageName;
    // package的version
    this.packageVersion = options.packageVersion;
    // package的缓存目录前缀
    this.cacheFilePathPrefix = this.packageName.replace('/', '_');
  }

  get cacheFilePath() {
    return path.resolve(
      this.storeDir,
      `_${this.cacheFilePathPrefix}@${this.packageVersion}@${this.packageName}`
    );
  }

  getSpecificCacheFilePath(packageVersion) {
    return path.resolve(
      this.storeDir,
      `_${this.cacheFilePathPrefix}@${packageVersion}@${this.packageName}`
    );
  }

  async prepare() {
    if (this.storeDir && !pathExists(this.storeDir)) {
      fse.mkdirpSync(this.storeDir); // 创建路径所有的文件
    }
    if (this.packageVersion === 'latest') {
      this.packageVersion = await getNpmLatestVersion(this.packageName);
      console.log('prepare', this.packageVersion);
    }
  }

  // 判断当前Package是否存在
  async exists() {
    if (this.storeDir) {
      await this.prepare();
      return pathExists(this.cacheFilePath);
    } else {
      return pathExists(this.targetPath);
    }
  }

  // 安装Package
  async install() {
    await this.prepare();
    return npminstall({
      root: this.targetPath,
      storeDir: this.storeDir,
      register: getDefaultRegistry(),
      pkgs: [
        {
          name: this.packageName,
          version: this.packageVersion,
        },
      ],
    });
  }

  // 更新Package
  async update() {
    await this.prepare();
    // 1. 获取最新的npm模块版本号
    const latestPackageVersion = await getNpmLatestVersion(this.packageName);
    // 2. 查询最新版本号对应的路径是否存在
    const latestFilePath = this.getSpecificCacheFilePath(latestPackageVersion);
    // 3. 如果不存在, 则直接安装最新版本
    if (!pathExists(latestFilePath)) {
      await npminstall({
        root: this.targetPath,
        storeDir: this.storeDir,
        registry: getDefaultRegistry(),
        pkgs: [
          {
            name: this.packageName,
            version: latestPackageVersion,
          },
        ],
      });
      this.packageVersion = latestPackageVersion;
    } else {
      this.packageVersion = latestPackageVersion;
    }
  }

  // 获取入口文件路径
  getRootFilePath() {
    function _getRootFile(targetPath) {
      // 1. 获取package.json所在目录 -> pkg-dir
      const dir = pkgDir(targetPath);
      if (dir) {
        // 2. 读取package.json
        const pkgFile = require(path.resolve(dir, 'package.json'));
        // 3. 寻找main/lib
        if (pkgDir && pkgFile.main) {
          // 4. 路径的兼容(macOS/Windows)
          return formatPath(path.resolve(dir, pkgFile.main));
        }
      }
      return null;
    }
    if (this.storeDir) {
      return _getRootFile(this.cacheFilePath);
    } else {
      return _getRootFile(this.targetPath);
    }
  }
}

module.exports = Package;

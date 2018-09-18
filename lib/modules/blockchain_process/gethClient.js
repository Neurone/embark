const async = require('async');

const DEFAULTS = {
  "BIN": "geth",
  "NETWORK_TYPE": "custom",
  "NETWORK_ID": 1337,
  "RPC_API": ['eth', 'web3', 'net', 'debug'],
  "WS_API": ['eth', 'web3', 'net', 'shh', 'debug', 'pubsub'],
  "DEV_WS_API": ['eth', 'web3', 'net', 'shh', 'debug', 'pubsub', 'personal'],
  "TARGET_GAS_LIMIT": 8000000
};

// TODO: make all of this async
class GethClient {

  static get DEFAULTS() {
    return DEFAULTS;
  }

  constructor(options) {
    this.config = options && options.hasOwnProperty('config') ? options.config : {};
    this.env = options && options.hasOwnProperty('env') ? options.env : 'development';
    this.isDev = options && options.hasOwnProperty('isDev') ? options.isDev : (this.env === 'development');
    this.name = "geth";
    this.prettyName = "Go-Ethereum (https://github.com/ethereum/go-ethereum)";
    this.bin = this.config.ethereumClientBin || DEFAULTS.BIN;
  }

  isReady(data) {
    return data.indexOf('WebSocket endpoint opened') > -1;
  }

  commonOptions() {
    let config = this.config;
    let cmd = [];

    cmd.push(this.determineNetworkType(config));

    if (config.datadir) {
      cmd.push(`--datadir=${config.datadir}`);
    }

    if (config.syncMode) {
      cmd.push("--syncmode=" + config.syncMode);
    }

    if (config.account && config.account.password) {
      cmd.push(`--password=${config.account.password}`);
    }

    if (Number.isInteger(config.verbosity) && config.verbosity >= 0 && config.verbosity <= 5) {
      cmd.push("--verbosity=" + config.verbosity);
    }

    return cmd;
  }

  getBinaryPath() {
    return this.bin;
  }

  determineVersionCommand() {
    return this.bin + " version";
  }

  determineNetworkType(config) {
    let cmd;
    if (config.networkType === 'testnet') {
      cmd = "--testnet";
    } else if (config.networkType === 'rinkeby') {
      cmd = "--rinkeby";
    } else if (config.networkType === 'custom') {
      cmd = "--networkid=" + config.networkId;
    }
    return cmd;
  }

  initGenesisCommmand() {
    let config = this.config;
    let cmd = this.bin + " " + this.commonOptions().join(' ');
    if (config.genesisBlock) {
      cmd += " init \"" + config.genesisBlock + "\" ";
    }
    return cmd;
  }

  newAccountCommand() {
    if (!(this.config.account && this.config.account.password)){
      console.warn(__('Your blockchain is missing a password and creating an account may fail. Please consider updating ').yellow + __('config/blockchain > account > password').cyan + __(' then re-run the command').yellow);
    }
    return this.bin + " " + this.commonOptions().join(' ') + " account new ";
  }

  listAccountsCommand() {
    return this.bin + " " + this.commonOptions().join(' ') + " account list ";
  }

  determineRpcOptions(config) {
    let cmd = [];
    cmd.push("--port=" + config.port);
    cmd.push("--rpc");
    cmd.push("--rpcport=" + config.rpcPort);
    cmd.push("--rpcaddr=" + config.rpcHost);
    if (config.rpcCorsDomain) {
      if (config.rpcCorsDomain === '*') {
        console.warn('==================================');
        console.warn(__('rpcCorsDomain set to *'));
        console.warn(__('make sure you know what you are doing'));
        console.warn('==================================');
      }
      cmd.push("--rpccorsdomain=" + config.rpcCorsDomain);
    } else {
      console.warn('==================================');
      console.warn(__('warning: cors is not set'));
      console.warn('==================================');
    }
    return cmd;
  }

  determineWsOptions(config) {
    let cmd = [];
    if (config.wsRPC) {
      cmd.push("--ws");
      cmd.push("--wsport=" + config.wsPort);
      cmd.push("--wsaddr=" + config.wsHost);
      if (config.wsOrigins) {
        if (config.wsOrigins === '*') {
          console.warn('==================================');
          console.warn(__('wsOrigins set to *'));
          console.warn(__('make sure you know what you are doing'));
          console.warn('==================================');
        }
        cmd.push("--wsorigins=" + config.wsOrigins);
      } else {
        console.warn('==================================');
        console.warn(__('warning: wsOrigins is not set'));
        console.warn('==================================');
      }
    }
    return cmd;
  }

  mainCommand(address, done) {
    let self = this;
    let config = this.config;
    let rpc_api = this.config.rpcApi;
    let ws_api = this.config.wsApi;
    let args = [];
    async.series([
      function commonOptions(callback) {
        let cmd = self.commonOptions();
        args = args.concat(cmd);
        callback(null, cmd);
      },
      function rpcOptions(callback) {
        let cmd = self.determineRpcOptions(self.config);
        args = args.concat(cmd);
        callback(null, cmd);
      },
      function wsOptions(callback) {
        let cmd = self.determineWsOptions(self.config);
        args = args.concat(cmd);
        callback(null, cmd);
      },
      function dontGetPeers(callback) {
        if (config.nodiscover) {
          args.push("--nodiscover");
          return callback(null, "--nodiscover");
        }
        callback(null, "");
      },
      function vmDebug(callback) {
        if (config.vmdebug) {
          args.push("--vmdebug");
          return callback(null, "--vmdebug");
        }
        callback(null, "");
      },
      function maxPeers(callback) {
        let cmd = "--maxpeers=" + config.maxpeers;
        args.push(cmd);
        callback(null, cmd);
      },
      function mining(callback) {
        if (config.mineWhenNeeded || config.mine) {
          args.push("--mine");
          return callback(null, "--mine");
        }
        callback("");
      },
      function bootnodes(callback) {
        if (config.bootnodes && config.bootnodes !== "" && config.bootnodes !== []) {
          args.push("--bootnodes=" + config.bootnodes);
          return callback(null, "--bootnodes=" + config.bootnodes);
        }
        callback("");
      },
      function whisper(callback) {
        if (config.whisper) {
          rpc_api.push('shh');
          if (ws_api.indexOf('shh') === -1) {
            ws_api.push('shh');
          }
          args.push("--shh");
          return callback(null, "--shh ");
        }
        callback("");
      },
      function rpcApi(callback) {
        args.push('--rpcapi=' + rpc_api.join(','));
        callback(null, '--rpcapi=' + rpc_api.join(','));
      },
      function wsApi(callback) {
        args.push('--wsapi=' + ws_api.join(','));
        callback(null, '--wsapi=' + ws_api.join(','));
      },
      function accountToUnlock(callback) {
        let accountAddress = "";
        if (config.account && config.account.address) {
          accountAddress = config.account.address;
        } else {
          accountAddress = address;
        }
        if (accountAddress && !self.isDev) {
          args.push("--unlock=" + accountAddress);
          return callback(null, "--unlock=" + accountAddress);
        }
        callback(null, "");
      },
      function gasLimit(callback) {
        if (config.targetGasLimit) {
          args.push("--miner.gastarget=" + config.targetGasLimit);
          return callback(null, "--miner.gastarget=" + config.targetGasLimit);
        }
        callback(null, "");
      },
      function isDev(callback) {
        if (self.isDev) {
          args.push('--dev');
          return callback(null, '--dev');
        }
        callback(null, '');
      }
    ], function(err) {
      if (err) {
        throw new Error(err.message);
      }
      return done(self.bin, args);
    });
  }
}

module.exports = GethClient;

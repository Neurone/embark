const async = require('async');

const DEFAULTS = {
  "BIN": "parity",
  "NETWORK_TYPE": "dev",
  "NETWORK_ID": 17,
  "RPC_API": ["web3", "eth", "pubsub", "net", "parity", "private", "parity_pubsub", "traces", "rpc", "shh", "shh_pubsub"],
  "WS_API": ["web3", "eth", "pubsub", "net", "parity", "private", "parity_pubsub", "traces", "rpc", "shh", "shh_pubsub"],
  "DEV_WS_API": ["web3", "eth", "pubsub", "net", "parity", "private", "parity_pubsub", "traces", "rpc", "shh", "shh_pubsub", "personal"],
  "TARGET_GAS_LIMIT": 8000000,
  "DEV_ACCOUNT": "0x00a329c0648769a73afac7f9381e08fb43dbea72"
};

const safePush = function(set, value) {
  if (set.indexOf(value) === -1) {
    set.push(value);
  }
};

class ParityClient {

  static get DEFAULTS() {
    return DEFAULTS;
  }

  constructor(options) {
    this.config = options && options.hasOwnProperty('config') ? options.config : {};
    this.env = options && options.hasOwnProperty('env') ? options.env : 'development';
    this.isDev = options && options.hasOwnProperty('isDev') ? options.isDev : (this.env === 'development');
    this.name = "parity";
    this.prettyName = "Parity-Ethereum (https://www.parity.io/ethereum/)";
    this.bin = this.config.ethereumClientBin || DEFAULTS.BIN;
  }

  isReady(data) {
    return data.indexOf('Public node URL') > -1;
  }

  commonOptions() {
    let config = this.config;
    let cmd = [];

    cmd.push(this.determineNetworkType(config));

    if (config.networkId) {
      cmd.push(`--network-id=${config.networkId}`);
    }

    if (config.datadir) {
      cmd.push(`--base-path=${config.datadir}`);
    }

    if (config.syncMode === 'light') {
      cmd.push("--light");
    } else if (config.syncMode === 'fast') {
      cmd.push("--pruning=fast");
    } else if (config.syncMode === 'full') {
      cmd.push("--pruning=archive");
    }

    if (this.isDev) cmd.push(`--password=${config.account.devPassword}`);
    else if (config.account && config.account.password) {
      cmd.push(`--password=${config.account.password}`);
    }

    if (Number.isInteger(config.verbosity) && config.verbosity >= 0 && config.verbosity <= 5) {
      switch (config.verbosity) {
        case 0: // No option to silent Parity, go to less verbose
        case 1:
          cmd.push("--logging=error");
          break;
        case 2:
          cmd.push("--logging=warn");
          break;
        case 3:
          cmd.push("--logging=info");
          break;
        case 4: // Debug is the max verbosity for Parity
        case 5:
          cmd.push("--logging=debug");
          break;
        default:
          cmd.push("--logging=info");
          break;
      }
    }

    return cmd;
  }

  getBinaryPath() {
    return this.bin;
  }

  determineVersionCommand() {
    return this.bin + " --version";
  }

  determineNetworkType(config) {
    if (this.isDev) {
      return "--chain=dev";
    }
    if (config.networkType === 'rinkeby') {
      console.warn(__('Parity does not support the Rinkeby PoA network, switching to Kovan PoA network'));
      config.networkType = 'kovan';
    } else if (config.networkType === 'testnet') {
      console.warn(__('Parity "testnet" corresponds to Kovan network, switching to Ropsten to be compliant with Geth parameters'));
      config.networkType = "ropsten";
    }
    return "--chain=" + config.networkType;
  }

  initGenesisCommmand() {
    //TODO-#733 There's no genesis init with Parity. Custom network are set in the chain property directly
    let config = this.config;
    let cmd = this.bin + " " + this.commonOptions().join(' ');
    if (config.genesisBlock) {
      cmd += " init \"" + config.genesisBlock + "\" ";
    }
    return cmd;
  }

  newAccountCommand() {
    return this.bin + " " + this.commonOptions().join(' ') + " account new ";
  }

  listAccountsCommand() {
    return this.bin + " " + this.commonOptions().join(' ') + " account list ";
  }

  determineRpcOptions(config) {
    let cmd = [];
    cmd.push("--port=" + config.port);
    cmd.push("--jsonrpc-port=" + config.rpcPort);
    cmd.push("--jsonrpc-interface=" + (config.rpcHost === 'localhost' ? 'local' : config.rpcHost));
    if (config.rpcCorsDomain) {
      if (config.rpcCorsDomain === '*') {
        console.warn('==================================');
        console.warn(__('rpcCorsDomain set to "all"'));
        console.warn(__('make sure you know what you are doing'));
        console.warn('==================================');
      }
      cmd.push("--jsonrpc-cors=" + (config.rpcCorsDomain === '*' ? 'all' : config.rpcCorsDomain));
    } else {
      console.warn('==================================');
      console.warn(__('warning: cors is not set'));
      console.warn('==================================');
    }
    cmd.push("--jsonrpc-hosts=all");
    return cmd;
  }

  determineWsOptions(config) {
    let cmd = [];
    if (config.wsRPC) {
      cmd.push("--ws-port=" + config.wsPort);
      cmd.push("--ws-interface=" + (config.wsHost === 'localhost' ? 'local' : config.wsHost));
      if (config.wsOrigins) {
        if (config.wsOrigins === '*') {
          console.warn('==================================');
          console.warn(__('wsOrigins set to "all"'));
          console.warn(__('make sure you know what you are doing'));
          console.warn('==================================');
        }
        cmd.push("--ws-origins=" + (config.wsOrigins === '*' ? 'all' : config.wsOrigins));
      } else {
        console.warn('==================================');
        console.warn(__('warning: wsOrigins is not set'));
        console.warn('==================================');
      }
      cmd.push("--ws-hosts=all");
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
          args.push("--no-discovery");
          return callback(null, "--no-discovery");
        }
        callback(null, "");
      },
      function vmDebug(callback) {
        if (config.vmdebug) {
          args.push("--tracing on");
          return callback(null, "--tracing on");
        }
        callback(null, "");
      },
      function maxPeers(callback) {
        let cmd = "--max-peers=" + config.maxpeers;
        args.push(cmd);
        callback(null, cmd);
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
          safePush(rpc_api, 'shh');
          safePush(rpc_api, 'shh_pubsub');
          safePush(ws_api, 'shh');
          safePush(ws_api, 'shh_pubsub');
          args.push("--whisper");
          return callback(null, "--whisper");
        }
        callback("");
      },
      function rpcApi(callback) {
        args.push('--jsonrpc-apis=' + rpc_api.join(','));
        callback(null, '--jsonrpc-apis=' + rpc_api.join(','));
      },
      function wsApi(callback) {
        args.push('--ws-apis=' + ws_api.join(','));
        callback(null, '--ws-apis=' + ws_api.join(','));
      },
      function accountToUnlock(callback) {
        let accountAddress = "";
        if (self.isDev) {
          // Default account for Parity dev chain
          args.push("--unlock=" + DEFAULTS.DEV_ACCOUNT);
          return callback(null, "--unlock=" + DEFAULTS.DEV_ACCOUNT);
        }
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
          args.push("--gas-floor-target=" + config.targetGasLimit);
          return callback(null, "--gas-floor-target=" + config.targetGasLimit);
        }
        // Default Parity gas limit is 4700000: let's set to the geth default
        args.push("--gas-floor-target=" + DEFAULTS.TARGET_GAS_LIMIT);
        return callback(null, "--gas-floor-target=" + DEFAULTS.TARGET_GAS_LIMIT);
      }
    ], function(err) {
      if (err) {
        throw new Error(err.message);
      }
      return done(self.bin, args);
    });
  }
}

module.exports = ParityClient;

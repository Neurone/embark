const utils = require('../../utils/utils.js');

class ConsoleListener {
  constructor(embark, options) {
    this.logger = embark.logger;
    this.ipc = options.ipc;
    this.events = embark.events;
    this.addressToContract = [];
    this.contractsConfig = embark.config.contractsConfig;
    this.contractsDeployed = false;
    this.outputDone = false;
    this._listenForLogRequests();
    this.events.on('outputDone', () => {
      this.outputDone = true;
    });

    this.events.on("contractsDeployed", () => {
      this.contractsDeployed = true;
      this._updateContractList();
    });
  }

  _updateContractList() {
    this.events.request("contracts:list", (_err, contractsList) => {
      if (_err) {
        this.logger.error(__("no contracts found"));
        return;
      }
      contractsList.forEach(contract => {
        if (!contract.deployedAddress) return;

        let address = contract.deployedAddress.toLowerCase();
        if (!this.addressToContract[address]) {
          let funcSignatures = {};
          contract.abiDefinition
            .filter(func => func.type === "function")
            .map(func => {
              const name = func.name +
                '(' +
                (func.inputs ? func.inputs.map(input => input.type).join(',') : '') +
                ')';
              funcSignatures[utils.sha3(name).substring(0, 10)] = {
                name,
                abi: func,
                functionName: func.name
              };
            });

          this.addressToContract[address] = {
            name: contract.className,
            functions: funcSignatures,
            silent: contract.silent
          };
        }
      });
    });
  }

  _listenForLogRequests() {
    if (this.ipc.ipcRole !== 'server') return;
    this.ipc.on('log', (request) => {
      if (request.type === 'contract-log') {
        if (!this.contractsDeployed) return;

        let {address, data, transactionHash, blockNumber, gasUsed, status} = request;
        const contract = this.addressToContract[address];

        if (!contract) {
          this._updateContractList();
          return;
        }

        const {name, silent} = contract;
        if (silent && !this.outputDone) {
          return;
        }

        const func = contract.functions[data.substring(0, 10)];
        const functionName = func.functionName;

        const decodedParameters = utils.decodeParams(func.abi.inputs, data.substring(10));
        let paramString = "";
        if (func.abi.inputs) {
          func.abi.inputs.forEach((input) => {
            let quote = input.type.indexOf("int") === -1 ? '"' : '';
            paramString += quote + decodedParameters[input.name] + quote + ", ";
          });
          paramString = paramString.substring(0, paramString.length - 2);
        }

        gasUsed = utils.hexToNumber(gasUsed);
        blockNumber = utils.hexToNumber(blockNumber);

        this.logger.info(`Blockchain>`.underline + ` ${name}.${functionName}(${paramString})`.bold + ` | ${transactionHash} | gas:${gasUsed} | blk:${blockNumber} | status:${status}`);
      } else {
        this.logger.info(JSON.stringify(request));
      }
    });
  }
}

module.exports = ConsoleListener;

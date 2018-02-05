/**
Template Controllers

@module Templates
*/

/**
The add user template

@class [template] views_send
@constructor
*/


/**
The default gas to provide for estimates. This is set manually,
so that invalid data etsimates this value and we can later set it down and show a warning,
when the user actually wants to send the dummy data.

@property defaultEstimateGas
*/
var defaultEstimateGas = 50000000;


/**
Check if the amount accounts daily limit  and sets the correct text.

@method checkOverDailyLimit
*/
var checkOverDailyLimit = function(address, wei, template){
    // check if under or over dailyLimit
    account = Helpers.getAccountByAddress(address);

    if(account && account.requiredSignatures > 1 && !_.isUndefined(account.dailyLimit) && account.dailyLimit !== ethereumConfig.dailyLimitDefault && Number(wei) !== 0) {
        // check whats left
        var restDailyLimit = new BigNumber(account.dailyLimit || '0', 10).minus(new BigNumber(account.dailyLimitSpent || '0', 10));

        if(restDailyLimit.lt(new BigNumber(wei, 10)))
            TemplateVar.set('dailyLimitText', new Spacebars.SafeString(TAPi18n.__('wallet.send.texts.overDailyLimit', {limit: EthTools.formatBalance(restDailyLimit.toString(10)), total: EthTools.formatBalance(account.dailyLimit), count: account.requiredSignatures - 1})));
        else
            TemplateVar.set('dailyLimitText', new Spacebars.SafeString(TAPi18n.__('wallet.send.texts.underDailyLimit', {limit: EthTools.formatBalance(restDailyLimit.toString(10)), total: EthTools.formatBalance(account.dailyLimit)})));
    } else
        TemplateVar.set('dailyLimitText', false);
};

/**
Get the data field of either the byte or source code textarea, depending on the selectedType

@method getDataField
*/
var getDataField = function(){
    // make reactive to the show/hide of the textarea
    TemplateVar.getFrom('.compile-contract','byteTextareaShown');



    // send tokens
    var selectedToken = TemplateVar.get('selectedToken');

    if(selectedToken && selectedToken !== 'ether') {
        var mainRecipient = TemplateVar.getFrom('div.dapp-address-input input.to', 'value');
        var amount = TemplateVar.get('amount') || '0';
        var token = Tokens.findOne({address: selectedToken});
        var tokenInstance = TokenContract.at(selectedToken);
        var txData = tokenInstance.transfer.getData( mainRecipient, amount,  {});

        return txData;
    }

    return TemplateVar.getFrom('.compile-contract', 'txData');
};


/**
Gas estimation callback

@method estimationCallback
*/
var estimationCallback = function(e, res){
    var template = this;

    console.log('Estimated gas: ', res, e);

    if(!e && res) {
        TemplateVar.set(template, 'estimatedGas', res);

        // show note if its defaultEstimateGas, as the data is not executeable
        if(res === defaultEstimateGas)
            TemplateVar.set(template, 'codeNotExecutable', true);
        else
            TemplateVar.set(template, 'codeNotExecutable', false);
    }
};


// Set basic variables
Template['views_send'].onCreated(function(){
    var template = this;

    // SET THE DEFAULT VARIABLES
    TemplateVar.set('amount', '0');
    TemplateVar.set('estimatedGas', 300000);
    TemplateVar.set('sendAll', false);

    // Deploy contract
    if(FlowRouter.getRouteName() === 'deployContract') {
        TemplateVar.set('selectedAction', 'deploy-contract');
        TemplateVar.set('selectedToken', 'ether');

    // Send funds
    } else {
        TemplateVar.set('selectedAction', 'send-funds');
        TemplateVar.set('selectedToken', FlowRouter.getParam('token') || 'ether');
    }

    // check if we are still on the correct chain
    Helpers.checkChain(function(error) {
        if(error && (EthAccounts.find().count() > 0)) {
            checkForOriginalWallet();
        }
    });


    // check daily limit again, when the account was switched
    template.autorun(function(c){
        var address = TemplateVar.getFrom('.dapp-select-account.send-from', 'value'),
            amount = TemplateVar.get('amount') || '0';

        if(!c.firstRun) {
            checkOverDailyLimit(address, amount, template);
        }
    });

    // change the amount when the currency unit is changed
    template.autorun(function(c){
        var unit = EthTools.getUnit();

        if(!c.firstRun && TemplateVar.get('selectedToken') === 'ether') {
            TemplateVar.set('amount', EthTools.toWei(template.find('input[name="amount"]').value.replace(',','.'), unit));
        }
    });

});



Template['views_send'].onRendered(function(){
    var template = this;

    // focus address input field
    if(FlowRouter.getParam('address')) {
        this.find('input[name="to"]').value = FlowRouter.getParam('address');
        this.$('input[name="to"]').trigger('input');
    } else if(!this.data){
        this.$('input[name="to"]').focus();
    }

    // set the from
    var from = FlowRouter.getParam('from');
    if(from)
        TemplateVar.setTo('select[name="dapp-select-account"].send-from', 'value', FlowRouter.getParam('from').toLowerCase());


    // initialize send view correctly when directly switching from deploy view
    template.autorun(function(c){
        if(FlowRouter.getRouteName() === 'send') {
            TemplateVar.set('selectedAction', 'send');
            TemplateVar.setTo('.dapp-data-textarea', 'value', '');
        }
    });


    // change the token type when the account is changed
    var selectedAddress;
    template.autorun(function(c){

        address = TemplateVar.getFrom('.dapp-select-account.send-from', 'value');

        if (c.firstRun) {
            selectedAddress = address;
            return;
        };


        if (selectedAddress !== address) {
            TemplateVar.set('selectedToken', 'ether');
        }

        selectedAddress = address;
    });

    // ->> GAS PRICE ESTIMATION
    template.autorun(function(c){
        var address = TemplateVar.getFrom('.dapp-select-account.send-from', 'value'),
            to = TemplateVar.getFrom('.dapp-address-input .to', 'value'),
            amount = TemplateVar.get('amount') || '0',
            data = getDataField(),
            tokenAddress = TemplateVar.get('selectedToken');

        if(_.isString(address))
            address = address.toLowerCase();


        // Ether tx estimation
        if(tokenAddress === 'ether') {

            if(EthAccounts.findOne({address: address}, {reactive: false})) {
                web3.eth.estimateGas({
                    from: address,
                    to: to,
                    value: amount,
                    data: data,
                    gas: defaultEstimateGas
                }, estimationCallback.bind(template));

            // Wallet tx estimation
            } else if(wallet = Wallets.findOne({address: address}, {reactive: false})) {

                if(contracts['ct_'+ wallet._id])
                    contracts['ct_'+ wallet._id].execute.estimateGas(to || '', amount || '', data || '',{
                        from: wallet.owners[0],
                        gas: defaultEstimateGas
                    }, estimationCallback.bind(template));
            }

        // Custom coin estimation
        } else {

            TokenContract.at(tokenAddress).transfer.estimateGas(to, amount, {
                from: address,
                gas: defaultEstimateGas
            }, estimationCallback.bind(template));
        }
    });
});


Template['views_send'].helpers({
    /**
    Get the current selected account

    @method (selectedAccount)
    */
    'selectedAccount': function(){
        return Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));
    },
    /**
    Get the current selected token document

    @method (selectedToken)
    */
    'selectedToken': function(){
        return Tokens.findOne({address: TemplateVar.get('selectedToken')});
    },
    /**
    Retrun checked, if the current token is selected

    @method (tokenSelectedAttr)
    */
    'tokenSelectedAttr': function(token) {
        return (TemplateVar.get('selectedToken') === token)
            ? {checked: true}
            : {};
    },
    /**
    Get all tokens

    @method (tokens)
    */
    'tokens': function(){
        if(TemplateVar.get('selectedAction') === 'send-funds')
            return Tokens.find({},{sort: {name: 1}});
    },
    /**
    Checks if the current selected account has tokens

    @method (hasTokens)
    */
    'hasTokens': function() {
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value')),
            query = {};


        if(!selectedAccount)
            return;

        query['balances.'+ selectedAccount._id] = {$exists: true, $ne: '0'};

        return (TemplateVar.get('selectedAction') === 'send-funds' && !!Tokens.findOne(query, {field: {_id: 1}}));
    },
    /**
    Show the byte code only for the data field

    @method (showOnlyByteTextarea)
    */
    'showOnlyByteTextarea': function() {
        return (TemplateVar.get("selectedAction") !== "deploy-contract");
    },
    /**
    Return the currently selected fee + amount

    @method (total)
    */
    'total': function(ether){
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));
        var amount = TemplateVar.get('amount');
        if(!_.isFinite(amount))
            return '0';

        // ether
        var gasInWei = TemplateVar.getFrom('.dapp-select-gas-price', 'gasInWei') || '0';

        if (TemplateVar.get('selectedToken') === 'ether') {
            amount = (selectedAccount && selectedAccount.owners)
                ? amount
                : new BigNumber(amount, 10).plus(new BigNumber(gasInWei, 10));

        } else {
            amount = new BigNumber(gasInWei, 10);
        }
        return amount;
    },
    /**
    Return the currently selected token amount

    @method (tokenTotal)
    */
    'tokenTotal': function(){
        var amount = TemplateVar.get('amount'),
            token = Tokens.findOne({address: TemplateVar.get('selectedToken')});

        if(!_.isFinite(amount) || !token)
            return '0';

        return Helpers.formatNumberByDecimals(amount, token.decimals);
    },
    /**
    Returns the total amount - the fee paid to send all ether/coins out of the account

    @method (sendAllAmount)
    */
    'sendAllAmount': function(){
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));
        var amount = 0;

        if (TemplateVar.get('selectedToken') === 'ether') {
            var gasInWei = TemplateVar.getFrom('.dapp-select-gas-price', 'gasInWei') || '0';

            // deduct fee if account, for contracts use full amount
            amount = (selectedAccount.owners)
                ? selectedAccount.balance
                : BigNumber.max(0, new BigNumber(selectedAccount.balance, 10).minus(new BigNumber(gasInWei, 10))).toString(10);
        } else {
            var token = Tokens.findOne({address: TemplateVar.get('selectedToken')});

            if(!token || !token.balances || !token.balances[selectedAccount._id])
                amount = '0';
            else
                amount = token.balances[selectedAccount._id];
        }

        TemplateVar.set('amount', amount);
        return amount;
    },
    /**
    Returns the decimals of the current token

    @method (tokenDecimals)
    */
    'tokenDecimals': function(){
        var token = Tokens.findOne({address: TemplateVar.get('selectedToken')});
        return token ? token.decimals : 0;
    },
    /**
    Returns the right time text for the "sendText".

    @method (timeText)
    */
    'timeText': function(){
        return TAPi18n.__('wallet.send.texts.timeTexts.'+ ((Number(TemplateVar.getFrom('.dapp-select-gas-price', 'feeMultiplicator')) + 5) / 2).toFixed(0));
    },
    /**

    Shows correct explanation for token type

    @method (sendExplanation)
    */
    'sendExplanation': function(){

        var amount = TemplateVar.get('amount') || '0',
            selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value')),
            token = Tokens.findOne({address: TemplateVar.get('selectedToken')});

        if(!token || !selectedAccount)
            return;

        return Spacebars.SafeString(TAPi18n.__('wallet.send.texts.sendToken', {
            amount: Helpers.formatNumberByDecimals(amount, token.decimals),
            name: token.name,
            symbol: token.symbol
        }));

    },
    /**
    Get Balance of a token

    @method (formattedCoinBalance)
    */
    'formattedCoinBalance': function(e){
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));

        return (this.balances && Number(this.balances[selectedAccount._id]) > 0)
            ? Helpers.formatNumberByDecimals(this.balances[selectedAccount._id], this.decimals) +' '+ this.symbol
            : false;
    },
    /**
    Checks if the current selected account is a wallet contract

    @method (selectedAccountIsWalletContract)
    */
    'selectedAccountIsWalletContract': function(){
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));
        return selectedAccount ? !!selectedAccount.owners : false;
    },
    /**
    Clear amount from characters

    @method (clearAmountFromChars)
    */
    'clearAmountFromChars': function(amount){
        amount = (~amount.indexOf('.'))
            ? amount.replace(/\,/g,'')
            : amount;

        return amount.replace(/ /g,'');
    }
});


Template['views_send'].events({
    /**
    Send all funds

    @event change input.send-all
    */
    'change input.send-all': function(e){
        TemplateVar.set('sendAll', $(e.currentTarget)[0].checked);
        TemplateVar.set('amount', 0);
    },
    /**
    Select a token

    @event click .token-ether
    */
    'click .token-ether': function(e, template){
        TemplateVar.set('selectedToken', 'ether');

        // trigger amount box change
        template.$('input[name="amount"]').trigger('change');
    },
    /**
    Select a token

    @event click .select-token
    */
    'click .select-token input': function(e, template){
        var value = e.currentTarget.value;
        TemplateVar.set('selectedToken', value);

        if (value === 'ether')
            TemplateVar.setTo('.dapp-data-textarea', 'value', '');

        // trigger amount box change
        template.$('input[name="amount"]').trigger('change');
    },
    /**
    Set the amount while typing

    @event keyup input[name="amount"], change input[name="amount"], input input[name="amount"]
    */
    'keyup input[name="amount"], change input[name="amount"], input input[name="amount"]': function(e, template){
        // ether
        if(TemplateVar.get('selectedToken') === 'ether') {
            var wei = EthTools.toWei(e.currentTarget.value.replace(',','.'));

            TemplateVar.set('amount', wei || '0');

            checkOverDailyLimit(template.find('select[name="dapp-select-account"].send-from').value, wei, template);

        // token
        } else {

            var token = Tokens.findOne({address: TemplateVar.get('selectedToken')}),
                amount = e.currentTarget.value || '0';

            amount = new BigNumber(amount, 10).times(Math.pow(10, token.decimals || 0)).floor().toString(10);

            TemplateVar.set('amount', amount);
        }
    },
    /**
    Submit the form and send the transaction!

    @event submit form
    */
    'submit form': function(e, template){

        var amount = TemplateVar.get('amount') || '0',
            tokenAddress = TemplateVar.get('selectedToken'),
            to = TemplateVar.getFrom('.dapp-address-input .to', 'value'),
            gasPrice = TemplateVar.getFrom('.dapp-select-gas-price', 'gasPrice'),
            estimatedGas = TemplateVar.get('estimatedGas'),
            selectedAccount = Helpers.getAccountByAddress(template.find('select[name="dapp-select-account"].send-from').value),
            selectedAction = TemplateVar.get("selectedAction"),
            data = getDataField(),
            contract = TemplateVar.getFrom('.compile-contract', 'contract'),
            sendAll = TemplateVar.get('sendAll');


        if(selectedAccount && !TemplateVar.get('sending')) {

            // set gas down to 21 000, if its invalid data, to prevent high gas usage.
            if(estimatedGas === defaultEstimateGas || estimatedGas === 0)
                estimatedGas = 22000;

            // if its a wallet contract and tokens, don't need to remove the gas addition on send-all, as the owner pays
            if(sendAll && (selectedAccount.owners || tokenAddress !== 'ether'))
                sendAll = false;


            console.log('Providing gas: ', estimatedGas , sendAll ? '' : ' + 100000');

            if(TemplateVar.get('selectedAction') === 'deploy-contract' && !data)
                return GlobalNotification.warning({
                    content: 'i18n:wallet.contracts.error.noDataProvided',
                    duration: 2
                });

            if(selectedAccount.balance === '0' && (!selectedAccount.owners || tokenAddress === 'ether'))
                return GlobalNotification.warning({
                    content: 'i18n:wallet.send.error.emptyWallet',
                    duration: 2
                });

            if(!web3.isAddress(to) && !data)
                return GlobalNotification.warning({
                    content: 'i18n:wallet.send.error.noReceiver',
                    duration: 2
                });

            if(tokenAddress === 'ether') {

                if((_.isEmpty(amount) || amount === '0' || !_.isFinite(amount)) && !data)
                    return GlobalNotification.warning({
                        content: 'i18n:wallet.send.error.noAmount',
                        duration: 2
                    });

                if(new BigNumber(amount, 10).gt(new BigNumber(selectedAccount.balance, 10)))
                    return GlobalNotification.warning({
                        content: 'i18n:wallet.send.error.notEnoughFunds',
                        duration: 2
                    });

            } else { // Token transfer

                if(!to) {
                    return GlobalNotification.warning({
                        content: 'i18n:wallet.send.error.noReceiver',
                        duration: 2
                    });
                }

                // Change recipient and amount
                to = tokenAddress;
                amount = 0;

                var token = Tokens.findOne({address: tokenAddress}),
                    tokenBalance = token.balances[selectedAccount._id] || '0';

                if(new BigNumber(amount, 10).gt(new BigNumber(tokenBalance, 10)))
                    return GlobalNotification.warning({
                        content: 'i18n:wallet.send.error.notEnoughFunds',
                        duration: 2
                    });
            }

            // The function to send the transaction
            var sendTransaction = function(estimatedGas){

                // show loading
                TemplateVar.set(template, 'sending', true);

                // use gas set in the input field
                estimatedGas = estimatedGas || Number($('.send-transaction-info input.gas').val());
                console.log('Finally choosen gas', estimatedGas);

                // CONTRACT TX
                if(contracts['ct_'+ selectedAccount._id]) {

                    contracts['ct_'+ selectedAccount._id].execute.sendTransaction(to || '', amount || '', data || '', {
                        from: Helpers.getOwnedAccountFrom(selectedAccount.owners),
                        gasPrice: gasPrice,
                        gas: estimatedGas
                    }, function(error, txHash){

                        TemplateVar.set(template, 'sending', false);

                        console.log(error, txHash);
                        if(!error) {
                            console.log('SEND from contract', amount);

                            data = (!to && contract)
                                ? {contract: contract, data: data}
                                : data;

                            addTransactionAfterSend(txHash, amount, selectedAccount.address, to, gasPrice, estimatedGas, data);

                            localStorage.setItem('contractSource', Helpers.getDefaultContractExample());
                            localStorage.setItem('compiledContracts', null);
                            localStorage.setItem('selectedContract', null);

                            FlowRouter.go('dashboard');

                        } else {
                            // EthElements.Modal.hide();

                            GlobalNotification.error({
                                content: error.message,
                                duration: 8
                            });
                        }
                    });

                // SIMPLE TX
                } else {

                    console.log('Gas Price: '+ gasPrice);
                    console.log('Amount:', amount);

                    web3.eth.sendTransaction({
                        from: selectedAccount.address,
                        to: to,
                        data: data,
                        value: amount,
                        gasPrice: gasPrice,
                        gas: estimatedGas
                    }, function(error, txHash){

                        TemplateVar.set(template, 'sending', false);

                        console.log(error, txHash);
                        if(!error) {
                            console.log('SEND simple');

                            data = (!to && contract)
                                ? {contract: contract, data: data}
                                : data;

                            addTransactionAfterSend(txHash, amount, selectedAccount.address, to, gasPrice, estimatedGas, data);

                            localStorage.setItem('contractSource', Helpers.getDefaultContractExample());
                            localStorage.setItem('compiledContracts', null);
                            localStorage.setItem('selectedContract', null);

                            FlowRouter.go('dashboard');
                        } else {

                            // EthElements.Modal.hide();

                            GlobalNotification.error({
                                content: error.message,
                                duration: 8
                            });
                        }
                    });
                }
            };

            // SHOW CONFIRMATION WINDOW when NOT MIST
            if(typeof mist === 'undefined') {

                console.log('estimatedGas: ' + estimatedGas);

                EthElements.Modal.question({
                    template: 'views_modals_sendTransactionInfo',
                    data: {
                        from: selectedAccount.address,
                        to: to,
                        amount: amount,
                        gasPrice: gasPrice,
                        estimatedGas: estimatedGas,
                        estimatedGasPlusAddition: sendAll ? estimatedGas : estimatedGas + 100000, // increase the provided gas by 100k
                        data: data
                    },
                    ok: sendTransaction,
                    cancel: true
                },{
                    class: 'send-transaction-info'
                });

            // LET MIST HANDLE the CONFIRMATION
            } else {
                sendTransaction(sendAll ? estimatedGas : estimatedGas + 100000);
            }
        }
    }
});

// icube hacks
function icube_str_replace(_obj, s, r)
{
  if (typeof s === 'undefined') s = 'Etherbase';
  if (typeof r === 'undefined') r = 'iCubebase';
  if (typeof _obj === 'string') _obj = _obj.replace(new RegExp(s, 'g'), r);
  return _obj;
}

Template.__checkName("icube_selectAccount");                                                                          // 2
Template["icube_selectAccount"] = new Template("Template.icube_selectAccount", (function() {                           // 3
  var view = this;
                                                                                                 // 4
  return HTML.DIV({                                                                               // 5
    "class": function() {                                                                                            // 6
      return [ "dapp-select-account ", Spacebars.mustache(view.lookup("class")), " n-new-thumb" ];                                   // 7
    }                                                                                                                // 8
  }, "\n        ", HTML.SELECT({                                                                                     // 9
    name: function() {                                                                                               // 10
      return Blaze.If(function() {                                                                                   // 11
        return icube_str_replace(Spacebars.call(view.lookup("name")));                                                                  // 12
      }, function() {                                                                                                // 13
        return Blaze.View("lookup:name", function() {                                                                // 14
          return icube_str_replace(Spacebars.mustache(view.lookup("name")));                                                            // 15
        });                                                                                                          // 16
      }, function() {                                                                                                // 17
        return "dapp-select-account";                                                                                // 18
      });                                                                                                            // 19
    },                                                                                                               // 20
    "class": function() {                                                                                            // 21
      return Spacebars.mustache(view.lookup("class"));                                                               // 22
    }                                                                                                                // 23
  }, "\n            ", Blaze.Each(function() {                                                                       // 24
    return Spacebars.call(view.lookup("accounts"));                                                                  // 25
  }, function() {                                                                                                    // 26
    return [ "\n                ", HTML.OPTION(HTML.Attrs({                                                          // 27
      value: function() {                                                                                            // 28
        return Spacebars.mustache(view.lookup("address"));                                                           // 29
      }                                                                                                              // 30
    }, function() {                                                                                                  // 31
      return Spacebars.attrMustache(view.lookup("selected"));                                                        // 32
    }), "\n                    ", Blaze.If(function() {                                                              // 33
      return Spacebars.call(view.lookup("isAccount"));                                                               // 34
    }, function() {                                                                                                  // 35
      return "🔑";                                                                                                   // 36
    }), " ", Blaze.View("lookup:name", function() {                                                                  // 37
      return icube_str_replace(Spacebars.mustache(view.lookup("name")));                                                                // 38
    }), "\n                    ", Blaze.If(function() {                                                              // 39
      return Spacebars.call(view.lookup("balance"));                                                                 // 40
    }, function() {                                                                                                  // 41
      return [ "\n                        - ", Blaze.View("lookup:dapp_formatBalance", function() {                  // 42
        return Spacebars.mustache(view.lookup("dapp_formatBalance"), view.lookup("balance"), "0,0.00");              // 43
      }), " ICUBE\n                        ", Blaze.If(function() {                                                  // 44
        return Spacebars.call(view.lookup("isNotEtherUnit"));                                                        // 45
      }, function() {                                                                                                // 46
        return [ "\n                            (", Blaze.View("lookup:dapp_formatBalance", function() {             // 47
          return Spacebars.mustache(view.lookup("dapp_formatBalance"), view.lookup("balance"), "0,0.00", "ether");
        }), " ICUBE)\n                        " ];                                                                         // 49
      }), "\n                    " ];                                                                                // 50
    }), "\n                "), "\n            " ];                                                                   // 51
  }), "\n        "), "\n        ", Blaze.If(function() {                                                             // 52
    return Spacebars.call(view.lookup("isAddress"));                                                                 // 53
  }, function() {                                                                                                    // 54
    return [ "\n        ", Blaze._TemplateWith(function() {                                                          // 55
      return {                                                                                                       // 56
        identity: Spacebars.call(Spacebars.dataMustache(Spacebars.dot(view.lookup("TemplateVar"), "get"), "value")),
        "class": Spacebars.call("dapp-small")                                                                        // 58
      };                                                                                                             // 59
    }, function() {                                                                                                  // 60
      return Spacebars.include(view.lookupTemplate("dapp_identicon_icube_send"));                                               // 61
    }), "\n        " ];                                                                                              // 62
  }, function() {                                                                                                    // 63
    return [ "\n        ", HTML.I({                                                                                  // 64
      "class": function() {                                                                                          // 65
        return [ "no-identicon icon-", Spacebars.mustache(Spacebars.dot(view.lookup("TemplateVar"), "get"), "value") ];
      }                                                                                                              // 67
    }), "\n        " ];                                                                                              // 68
  }), "\n    ");                                                                                                     // 69
}));

Template['icube_selectAccount'].onCreated(function(){                                                                 // 14
    if(this.data ) {                                                                                                 // 15
        if(this.data.value) {                                                                                        // 16
            TemplateVar.set('value', this.data.value);                                                               // 17
        } else if(this.data.accounts && this.data.accounts[0]) {                                                     // 18
            TemplateVar.set('value', this.data.accounts[0].address);                                                 // 19
        }                                                                                                            // 20
    }                                                                                                                // 21
});                                                                                                                  // 22
                                                                                                                     // 23
                                                                                                                     // 24
Template['icube_selectAccount'].helpers({                                                                             // 25
    /**                                                                                                              // 26
    Check if its a normal account                                                                                    // 27
                                                                                                                     // 28
    @method (isAccount)                                                                                              // 29
    */                                                                                                               // 30
    'isAccount': function(){                                                                                         // 31
        return this.type === 'account' && Template.parentData(1).showAccountTypes;                                   // 32
    },                                                                                                               // 33
    /**                                                                                                              // 34
    Return the selected attribute if its selected                                                                    // 35
                                                                                                                     // 36
    @method (selected)                                                                                               // 37
    */                                                                                                               // 38
    'selected': function(){                                                                                          // 39
        return (TemplateVar.get('value') === this.address)                                                           // 40
            ? {selected: true}                                                                                       // 41
            : {};                                                                                                    // 42
    },                                                                                                               // 43
    /**                                                                                                              // 44
    Check if the current selected unit is not ether                                                                  // 45
                                                                                                                     // 46
    @method (isNotEtherUnit)                                                                                         // 47
    */                                                                                                               // 48
    'isNotEtherUnit': function() {                                                                                   // 49
        return EthTools.getUnit().toLowerCase() !== 'ether';                                                         // 50
    },                                                                                                               // 51
    /**                                                                                                              // 52
    Check if the current selected unit is not ether                                                                  // 53
                                                                                                                     // 54
    @method (isNotEtherUnit)                                                                                         // 55
    */                                                                                                               // 56
    'isAddress': function() {                                                                                        // 57
        return web3.isAddress(TemplateVar.get('value'));                                                             // 58
    }                                                                                                                // 59
});                                                                                                                  // 60
                                                                                                                     // 61
Template['icube_selectAccount'].events({                                                                              // 62
    /**                                                                                                              // 63
    Set the selected address.                                                                                        // 64
                                                                                                                     // 65
    @event change select                                                                                             // 66
    */                                                                                                               // 67
    'change select': function(e){                                                                                    // 68
        TemplateVar.set('value', e.currentTarget.value);                                                             // 69
    }                                                                                                                // 70
});

Template.__checkName("icube_selectGasPrice");                                                                         // 2
Template["icube_selectGasPrice"] = new Template("Template.icube_selectGasPrice", (function() {                         // 3
  var view = this;                                                                                                   // 4
  return HTML.DIV({                                                                                                  // 5
    "class": "dapp-select-gas-price"                                                                                 // 6
  }, "\n        ", HTML.SPAN(Blaze.View("lookup:fee", function() {                                                   // 7
    return Spacebars.mustache(view.lookup("fee"));                                                                   // 8
  }), " ", HTML.SPAN(Blaze.View("lookup:unit", function() {                                                          // 9
    return 'ICUBE';                                                                  // 10
  }))), HTML.Raw("\n        <br>\n        "), HTML.INPUT({                                                           // 11
    type: "range",                                                                                                   // 12
    name: "fee",                                                                                                     // 13
    min: "-4",                                                                                                       // 14
    max: "1",                                                                                                        // 15
    step: "1",                                                                                                       // 16
    value: function() {                                                                                              // 17
      return Spacebars.mustache(Spacebars.dot(view.lookup("TemplateVar"), "get"), "feeMultiplicator");               // 18
    }                                                                                                                // 19
  }), "\n        ", HTML.SPAN(Blaze.View("lookup:i18nText", function() {                                             // 20
    return Spacebars.mustache(view.lookup("i18nText"), "low");                                                       // 21
  })), "\n        ", HTML.SPAN(Blaze.View("lookup:i18nText", function() {                                            // 22
    return Spacebars.mustache(view.lookup("i18nText"), "high");                                                      // 23
  })), "\n    ");                                                                                                    // 24
}));

var toPowerFactor = 2;

var calculateGasInWei = function(template, gas, gasPrice, returnGasPrice){                                           // 27
    // Only defaults to 20 shannon if there's no default set                                                         // 28
    gasPrice = gasPrice || 20000000000;                                                                              // 29
                                                                                                                     // 30
    if(!_.isObject(gasPrice))                                                                                        // 31
        gasPrice = new BigNumber(String(gasPrice), 10);                                                              // 32
                                                                                                                     // 33
    if(_.isUndefined(gas)) {                                                                                         // 34
        console.warn('No gas provided for {{> icube_selectGasPrice}}');                                               // 35
        return new BigNumber(0);                                                                                     // 36
    }                                                                                                                // 37
                                                                                                                     // 38
    var feeMultiplicator = Number(TemplateVar.get(template, 'feeMultiplicator'));                                    // 39
                                                                                                                     // 40
    // divide and multiply to round it to the nearest billion wei (1 shannon)                                        // 41
    var billion = new BigNumber(1000000000);                                                                         // 42
    gasPrice = gasPrice.times(new BigNumber(toPowerFactor).toPower(feeMultiplicator)).dividedBy(billion).round().times(billion);
                                                                                                                     // 44
    return (returnGasPrice)                                                                                          // 45
        ? gasPrice                                                                                                   // 46
        : gasPrice.times(gas);                                                                                       // 47
}                                                                                                                    // 48
                                                                                                                     // 49
Template['icube_selectGasPrice'].onCreated(function(){                                                                // 50
    TemplateVar.set('gasInWei', '0');                                                                                // 51
    TemplateVar.set('gasPrice', '0');                                                                                // 52
    TemplateVar.set('feeMultiplicator', 0);                                                                          // 53
});                                                                                                                  // 54
                                                                                                                     // 55
                                                                                                                     // 56
Template['icube_selectGasPrice'].helpers({                                                                            // 57
    /**                                                                                                              // 58
    Return the currently selected fee value calculate with gas price                                                 // 59
                                                                                                                     // 60
    @method (fee)                                                                                                    // 61
    */                                                                                                               // 62
    'fee': function(){                                                                                               // 63
        if(_.isFinite(TemplateVar.get('feeMultiplicator')) && _.isFinite(this.gas)) {                                // 64
            var template = Template.instance();                                                                      // 65
                                                                                                                     // 66
            // set the value                                                                                         // 67
            TemplateVar.set('gasInWei', calculateGasInWei(template, this.gas, this.gasPrice).floor().toString(10));  // 68
            TemplateVar.set('gasPrice', calculateGasInWei(template, this.gas, this.gasPrice, true).floor().toString(10));
                                                                                                                     // 70
            // return the fee                                                                                        // 71
            return EthTools.formatBalance(calculateGasInWei(template, this.gas, this.gasPrice).toString(10), '0,0.[000000000000000000]', this.unit);
        }                                                                                                            // 73
    },                                                                                                               // 74
    /**                                                                                                              // 75
    Return the current unit                                                                                          // 76
                                                                                                                     // 77
    @method (unit)                                                                                                   // 78
    */                                                                                                               // 79
    'unit': function(){                                                                                              // 80
        var unit = this.unit || EthTools.getUnit();                                                                  // 81
        if(unit)                                                                                                     // 82
            return unit.toUpperCase();                                                                               // 83
    },                                                                                                               // 84
    /**                                                                                                              // 85
    Get the correct text, if TAPi18n is available.                                                                   // 86
                                                                                                                     // 87
    @method i18nText                                                                                                 // 88
    */                                                                                                               // 89
    'i18nText': function(key){                                                                                       // 90
        if(typeof TAPi18n !== 'undefined'                                                                            // 91
            && TAPi18n.__('elements.selectGasPrice.'+ key) !== 'elements.selectGasPrice.'+ key) {                    // 92
            return TAPi18n.__('elements.selectGasPrice.'+ key);                                                      // 93
        } else if (typeof this[key] !== 'undefined') {                                                               // 94
            return this[key];                                                                                        // 95
        } else {                                                                                                     // 96
            return (key === 'high') ? '+' : '-';                                                                     // 97
        }                                                                                                            // 98
    }                                                                                                                // 99
});                                                                                                                  // 100
                                                                                                                     // 101
Template['icube_selectGasPrice'].events({                                                                             // 102
    /**                                                                                                              // 103
    Change the selected fee                                                                                          // 104
                                                                                                                     // 105
    @event change input[name="fee"], input input[name="fee"]                                                         // 106
    */                                                                                                               // 107
    'change input[name="fee"], input input[name="fee"]': function(e){                                                // 108
        TemplateVar.set('feeMultiplicator', Number(e.currentTarget.value));                                          // 109
    },                                                                                                               // 110
});

Template.__checkName("dapp_addressInput_icube");                                                                           // 2
Template["dapp_addressInput_icube"] = new Template("Template.dapp_addressInput_icube", (function() {                             // 3
    var view = this;                                                                                                   // 4
    return HTML.DIV({                                                                                                  // 5
        class: "dapp-address-input n-new-thumb"                                                                                      // 6
    }, "\n        ", HTML.INPUT(HTML.Attrs({                                                                           // 7
        type: "text",                                                                                                    // 8
        name: function() {                                                                                               // 9
            return Spacebars.mustache(view.lookup("name"));                                                                // 10
        },                                                                                                               // 11
        placeholder: function() {                                                                                        // 12
            return Spacebars.mustache(view.lookup("placeholder"));                                                         // 13
        },                                                                                                               // 14
        class: function() {                                                                                              // 15
            return [ Spacebars.mustache(view.lookup("class")), " ", Blaze.Unless(function() {                              // 16
                return Spacebars.dataMustache(Spacebars.dot(view.lookup("TemplateVar"), "get"), "isValid");                  // 17
            }, function() {                                                                                                // 18
                return "dapp-error";                                                                                         // 19
            }), " ", Blaze.Unless(function() {                                                                             // 20
                return Spacebars.dataMustache(Spacebars.dot(view.lookup("TemplateVar"), "get"), "isChecksum");               // 21
            }, function() {                                                                                                // 22
                return " dapp-non-checksum ";                                                                                // 23
            }) ];                                                                                                          // 24
        },                                                                                                               // 25
        value: function() {                                                                                              // 26
            return Spacebars.mustache(view.lookup("value"));                                                               // 27
        },                                                                                                               // 28
        title: function() {                                                                                              // 29
            return Blaze.Unless(function() {                                                                               // 30
                return Spacebars.dataMustache(Spacebars.dot(view.lookup("TemplateVar"), "get"), "isChecksum");               // 31
            }, function() {                                                                                                // 32
                return Blaze.View("lookup:i18nText", function() {                                                            // 33
                    return Spacebars.mustache(view.lookup("i18nText"));                                                        // 34
                });                                                                                                          // 35
            });                                                                                                            // 36
        }                                                                                                                // 37
    }, function() {                                                                                                    // 38
        return Spacebars.attrMustache(view.lookup("additionalAttributes"));                                              // 39
    })), "\n        ", Blaze.If(function() {                                                                           // 40
        return Spacebars.dataMustache(Spacebars.dot(view.lookup("TemplateVar"), "get"), "isValid");                      // 41
    }, function() {                                                                                                    // 42
        return [ "\n            ", Blaze._TemplateWith(function() {                                                      // 43
            return {                                                                                                       // 44
                identity: Spacebars.call(view.lookup("address")),                                                            // 45
                class: Spacebars.call("dapp-small")                                                                          // 46
            };                                                                                                             // 47
        }, function() {                                                                                                  // 48
            return Spacebars.include(view.lookupTemplate("dapp_identicon_icube_send"));                                               // 49
        }), "\n        " ];                                                                                              // 50
    }, function() {                                                                                                    // 51
        return [ "\n            ", HTML.I({                                                                              // 52
            class: "icon-shield"                                                                                           // 53
        }), "\n        " ];                                                                                              // 54
    }), "\n    ");                                                                                                     // 55
}));

Template['dapp_addressInput_icube'].onCreated(function(){                                                                  // 14
    // 15
    // default set to true, to show no error                                                                         // 16
    TemplateVar.set('isValid', true);                                                                                // 17
    TemplateVar.set('isChecksum', true);                                                                             // 18
                                                                                                                     // 19
    if(this.data && this.data.value) {                                                                               // 20
        TemplateVar.set('value', this.data.value);                                                                   // 21
        console.log('value: ', this.data.value);                                                                     // 22
    }                                                                                                                // 23
});                                                                                                                  // 24
                                                                                                                     // 25
Template['dapp_addressInput_icube'].onRendered(function(){                                                                 // 26
    if(this.data && this.data.value) {                                                                               // 27
        this.$('input').trigger('change');                                                                           // 28
    }                                                                                                                // 29
});                                                                                                                  // 30
                                                                                                                     // 31
Template['dapp_addressInput_icube'].helpers({                                                                              // 32
    /**                                                                                                              // 33
     Return the to address                                                                                            // 34
     // 35
     @method (address)                                                                                                // 36
     */                                                                                                               // 37
    'address': function(){                                                                                           // 38
        var address = TemplateVar.get('value');                                                                      // 39
                                                                                                                     // 40
        if(Template.instance().view.isRendered && Template.instance().find('input').value !== address)               // 41
            Template.instance().$('input').trigger('change');                                                        // 42
                                                                                                                     // 43
        return (_.isString(address)) ? '0x'+ address.replace('0x','') : false;                                       // 44
    },                                                                                                               // 45
    /**                                                                                                              // 46
     Return the autofocus or disabled attribute.                                                                      // 47
     // 48
     @method (additionalAttributes)                                                                                   // 49
     */                                                                                                               // 50
    'additionalAttributes': function(){                                                                              // 51
        var attr = {};                                                                                               // 52
                                                                                                                     // 53
        if(this.autofocus)                                                                                           // 54
            attr.autofocus = true;                                                                                   // 55
        if(this.disabled)                                                                                            // 56
            attr.disabled = true;                                                                                    // 57
                                                                                                                     // 58
        return attr;                                                                                                 // 59
    },                                                                                                               // 60
    /**                                                                                                              // 61
     Get the correct text, if TAPi18n is available.                                                                   // 62
     // 63
     @method i18nText                                                                                                 // 64
     */                                                                                                               // 65
    'i18nText': function(){                                                                                          // 66
        if(typeof TAPi18n === 'undefined' || TAPi18n.__('elements.checksumAlert') == 'elements.checksumAlert') {     // 67
            return "This address looks valid, but it doesn't have some security features that will protect you against typos, so double check you have the right one. If provided, check if the security icon  matches.";
        } else {                                                                                                     // 69
            return TAPi18n.__('elements.checksumAlert');                                                             // 70
        }                                                                                                            // 71
    }                                                                                                                // 72
});                                                                                                                  // 73
                                                                                                                     // 74
                                                                                                                     // 75
Template['dapp_addressInput_icube'].events({                                                                               // 76
    /**                                                                                                              // 77
     Set the address while typing                                                                                     // 78
     // 79
     @event input input, change input                                                                                 // 80
     */                                                                                                               // 81
    'input input, change input': function(e, template){                                                              // 82
        var value = e.currentTarget.value.replace(/\s+/g, '');                                                       // 83
                                                                                                                     // 84
        // add 0x                                                                                                    // 85
        if(value.length > 2 && value.indexOf('0x') === -1) {                                                         // 86
            value = '0x'+ value;                                                                                     // 87
            e.currentTarget.value = value;                                                                           // 88
        }                                                                                                            // 89
                                                                                                                     // 90
        if(web3.isAddress(value) || _.isEmpty(value)) {                                                              // 91
            TemplateVar.set('isValid', true);                                                                        // 92
                                                                                                                     // 93
            if(!_.isEmpty(value)) {                                                                                  // 94
                TemplateVar.set('value', '0x'+ value.replace('0x',''));                                              // 95
                TemplateVar.set('isChecksum', web3.isChecksumAddress(value));                                        // 96
            } else {                                                                                                 // 97
                TemplateVar.set('value', undefined);                                                                 // 98
                TemplateVar.set('isChecksum', true);                                                                 // 99
            }                                                                                                        // 100
                                                                                                                     // 101
        } else {                                                                                                     // 102
            TemplateVar.set('isValid', false);                                                                       // 103
            TemplateVar.set('value', undefined);                                                                     // 104
        }                                                                                                            // 105
                                                                                                                     // 106
    },                                                                                                               // 107
    /**                                                                                                              // 108
     Prevent the identicon from beeing clicked.                                                                       // 109
     // 110
     TODO: remove?                                                                                                    // 111
     // 112
     @event click a                                                                                                   // 113
     */                                                                                                               // 114
    'click a': function(e){                                                                                          // 115
        e.preventDefault();                                                                                          // 116
    }                                                                                                                // 117
});

Template.__checkName("dapp_identicon_icube_send");
Template["dapp_identicon_icube_send"] = new Template("Template.dapp_identicon_icube_send", (function() {
    var view = this;
    return Blaze.If(function() {
        return Spacebars.call(view.lookup("identity"));
    }, function() {
        return [ "\n        ", Blaze.If(function() {
            return Spacebars.call(view.lookup("link"));
        }, function() {
            return [ "\n            ", HTML.A({
                href: function() {
                    return Spacebars.mustache(view.lookup("link"));
                },
                class: function() {
                    return [ "dapp-identicon ", Spacebars.mustache(view.lookup("class")) ];
                },
                style: function() {
                    return [ "background-image: url('", Spacebars.mustache(view.lookup("identiconData"), view.lookup("identity")), "')" ];
                },
                title: function() {
                    return Spacebars.mustache(view.lookup("i18nTextIcon"));
                }
            }), "\n        " ];
        }, function() {
            var imgPath = window.parseInt(Spacebars.call(view.lookup("identity")),16)%30;
            // window.alert(imgPath);
            return [ "\n            ", HTML.SPAN({
                class: function() {
                    return [ "dapp-identicon ", Spacebars.mustache(view.lookup("class")), " img",imgPath,""];
                },
                style: function() {
                    // return [ "background-image: url('../../images/", imgPath, ".png')" ];
                    // return [ "background-image: url('", Spacebars.mustache(view.lookup("identiconData"), view.lookup("identity")), "')" ];
                },
                title: function() {
                    return Spacebars.mustache(view.lookup("i18nTextIcon"));
                }
            }), "\n        " ];
        }), "\n    " ];
    });
}));

/**
 The cached identicons
 @property cache
 */
var cache = {};

Template['dapp_identicon_icube_send'].helpers({
    /**
     Make sure the identity is lowercased
     @method (identity)
     */
    'identity': function(identity){
        return (_.isString(this.identity)) ? this.identity.toLowerCase() : this.identity;
    },
    /**
     Return the cached or generated identicon
     @method (identiconData)
     */
    'identiconData': function(identity){
        // remove items if the cache is larger than 50 entries
        if(_.size(cache) > 50) {
            delete cache[Object.keys(cache)[0]];
        }

        return cache['ID_'+ identity] || (cache['ID_'+ identity] =  blockies.create({
            seed: identity,
            size: 8,
            scale: 8
        }).toDataURL());
    },
    /**
     Get the correct text, if TAPi18n is available.
     @method i18nText
     */
    'i18nTextIcon': function(){
        if(typeof TAPi18n === 'undefined' || TAPi18n.__('elements.identiconHelper') == 'elements.identiconHelper') {
            return "This is a security icon, if there's any change on the address the resulting icon should be a completelly different one";
        } else {
            return TAPi18n.__('elements.identiconHelper');
        }
    }
});


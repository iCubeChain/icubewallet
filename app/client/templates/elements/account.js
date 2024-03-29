/**
Template Controllers

@module Templates
*/

/**
The account template

@class [template] elements_account
@constructor
*/

/**
Block required until a transaction is confirmed.

@property blocksForConfirmation
@type Number
*/
var blocksForConfirmation = 12;

// hacks
function icube_str_replace(_obj, s, r)
{
  if (typeof s === 'undefined') s = 'Etherbase';
  if (typeof r === 'undefined') r = 'iCubebase';
  if (typeof _obj === 'string') _obj = _obj.replace(new RegExp(s, 'g'), r);
  return _obj;
}


Template['elements_account'].rendered = function(){

    // initiate the geo pattern
    var pattern = GeoPattern.generate(this.data.address);
    this.$('.account-pattern').css('background-image', pattern.toDataUrl());
};


Template['elements_account'].helpers({
    /**
    Get the current account

    @method (account)
    */
    'account': function(){
        return EthAccounts.findOne(this.account) || Wallets.findOne(this.account) || CustomContracts.findOne(this.account);
    },
    /**
    Get all tokens

    @method (tokens)
    */
    'tokens': function(){
        var query = {};
        query['balances.'+ this._id] = {$exists: true};
        return Tokens.find(query, {limit: 5, sort: {name: 1}});
    },
    /**
    Get the tokens balance

    @method (formattedTokenBalance)
    */
    'formattedTokenBalance': function(e){
        var account = Template.parentData(2);

        return (this.balances && Number(this.balances[account._id]) > 0)
            ? Helpers.formatNumberByDecimals(this.balances[account._id], this.decimals) +' '+ this.symbol
            : false;
    },
    /**
    Get the name

    @method (name)
    */
    'name': function(){
        return this.name || TAPi18n.__('wallet.accounts.defaultName');
    },
    /**
    Account was just added. Return true and remove the "new" field.

    @method (new)
    */
    'new': function() {
        if(this.new) {
            // remove the "new" field
            var id = this._id;
            Meteor.setTimeout(function() {
                EthAccounts.update(id, {$unset: {new: ''}});
                Wallets.update(id, {$unset: {new: ''}});
                CustomContracts.update(id, {$unset: {new: ''}});
            }, 1000);

            return true;
        }
    },
    /**
    Should the wallet show disabled

    @method (creating)
    */
    'creating': function(){
        var noAddress = !this.address;
        var isImported = this.imported;
        var belowReorgThreshold = (blocksForConfirmation >= EthBlocks.latest.number - (this.creationBlock - 1));
        var blockNumberCheck = EthBlocks.latest.number - (this.creationBlock - 1) >= 0;

        return (noAddress || isImported || (belowReorgThreshold && blockNumberCheck));
    },
    /**
    Returns the confirmations

    @method (totalConfirmations)
    */
    'totalConfirmations': blocksForConfirmation,
    /**
    Checks whether the transaction is confirmed ot not.

    @method (unConfirmed)
    */
    'unConfirmed': function() {
        if(!this.address || !this.creationBlock || this.createdIdentifier)
            return false;

        var currentBlockNumber = EthBlocks.latest.number,
            confirmations = currentBlockNumber - (this.creationBlock - 1);
        return (blocksForConfirmation >= confirmations && confirmations >= 0)
            ? {
                confirmations: confirmations,
                percent: (confirmations / (blocksForConfirmation)) * 100
            }
            : false;
    },
    /**
    Displays ENS names with triangles
    @method (nameDisplay)
    */
    'displayName': function(){
        return icube_str_replace((this.ens ? this.name.split('.').slice(0, -1).reverse().join(' ▸ ') : this.name));
    },
    /**
    Adds class about ens
    @method (ensClass)
    */
    'ensClass': function(){
        return this.ens ?  'ens-name' : 'not-ens-name';
    }
});

Template['elements_account'].events({
    /**
    Field test the speed wallet is rendered

    @event click button.show-data
    */
    'click .wallet-box': function(e){
        console.time('renderAccountPage');
    }
});

Template.__checkName("dapp_identicon_icube");
Template["dapp_identicon_icube"] = new Template("Template.dapp_identicon_icube", (function() {
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
                    // return [ "background-image: url('packages/ethereum_elements/", imgPath, ".png')" ];
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
 // 16
 @property cache
 */
var cache = {};

Template['dapp_identicon_icube'].helpers({
    /**
     Make sure the identity is lowercased
     // 24
     @method (identity)
     */
    'identity': function(identity){
        return (_.isString(this.identity)) ? this.identity.toLowerCase() : this.identity;
    },
    /**
     Return the cached or generated identicon
     // 32
     @method (identiconData)
     */
    'identiconData': function(identity){
        // 36
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
     // 50
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
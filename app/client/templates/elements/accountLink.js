/**
The account link template

@class [template] elements_account_link
@constructor
*/

// icube hacks
function icube_str_replace(_obj, s, r)
{
  if (typeof s === 'undefined') s = 'Etherbase';
  if (typeof r === 'undefined') r = 'iCubebase';
  if (typeof _obj === 'string') _obj = _obj.replace(new RegExp(s, 'g'), r);
  return _obj;
}

Template['elements_account_link'].helpers({
    /**
    Get the account and return the account or address of "from" or "to" property

    @method (getAccount)
    */
    'getAccount': function(){
        return Helpers.getAccountByAddress(this.address) || {address: web3.toChecksumAddress(this.address)};
    },
    /**
    Adds class about ens

    @method (ensClass)
    */
    'ensClass': function(){
        return this.ens ?  'ens-name' : 'not-ens-name';
    },
    /**
    Displays ENS names with triangles

    @method (nameDisplay)
    */
    'displayName': function(){
        return icube_str_replace((this.ens ? this.name.split('.').slice(0, -1).reverse().join(' ▸ ') : this.name));
    },
    /**
    Displays ENS names with triangles

    @method (nameDisplay)
    */
    'tryENS': function(){
        var template = Template;
        var _this = this;

        Helpers.getENSName(this.address, function(err, name, returnedAddr) {
            if (err) {
                console.log(err)
            } else if (this.address.toLowerCase() == returnedAddr ){
                console.log('ens', name, _this, template);
                // _this.name = name;
                // TemplateVar.set(template, 'ensName', name)
            }
        });


    }
});
Template.__checkName("dapp_identicon_icube_link");
Template["dapp_identicon_icube_link"] = new Template("Template.dapp_identicon_icube_link", (function() {
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

Template['dapp_identicon_icube_link'].helpers({
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

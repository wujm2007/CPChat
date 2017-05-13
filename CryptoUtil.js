/**
 * Created by jameswu on 2017/5/6.
 */

const crypto = require('crypto');
const NodeRSA = require('node-rsa');

function AES256Cipher(plainText, key) {
    const cipher = crypto.createCipher('aes256', key);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function AES256Decipher(encrypted, key) {
    const decipher = crypto.createDecipher('aes256', key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function genRSAKeyPair() {
    return new NodeRSA({b: 512});
}

module.exports = {
    AES256Cipher: AES256Cipher,
    AES256Decipher: AES256Decipher,
    genRSAKeyPair: genRSAKeyPair
};

// const key = new NodeRSA({b: 512});
//
// console.log(key.exportKey('private'));
// console.log(key.exportKey('public'));
//
// const text = 'Hello RSA!';
// const encrypted = key.encrypt(text, 'base64', 'utf8');
// console.log('encrypted: ', encrypted);
// const decrypted = key.decrypt(encrypted, 'utf8');
// console.log('decrypted: ', decrypted);
//
//
// const signed = key.sign(text, 'base64', 'utf8');
// console.log('signed: ', signed);
// const verified = key.verify(text, signed, 'utf8', 'base64');
// console.log('verified: ', verified);
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

function importKey(pem) {
    return new NodeRSA(pem);
}

function randomBytes() {
    return crypto.randomBytes(48);
}

function generateSessionKey(sub1, sub2) {
    return sub1.toString('base64') + sub2.toString('base64');
}

function hashcode(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}

module.exports = {
    AES256Cipher: AES256Cipher,
    AES256Decipher: AES256Decipher,
    generateRSAKeyPair: genRSAKeyPair,
    importKey: importKey,
    randomBytes: randomBytes,
    generateSessionKey: generateSessionKey,
    hashcode: hashcode
};
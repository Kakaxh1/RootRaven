// Real-time Cryptography API Sniffer & Key Extractor
// Intercepts: SecretKeySpec, IvParameterSpec, Cipher.init, Cipher.doFinal
Java.perform(function () {
    console.log("[*] Initializing Cryptography API Sniffer...");

    var SecretKeySpec = Java.use("javax.crypto.spec.SecretKeySpec");
    var IvParameterSpec = Java.use("javax.crypto.spec.IvParameterSpec");
    var Cipher = Java.use("javax.crypto.Cipher");
    var StringClass = Java.use("java.lang.String");

    function bytesToHex(bytes) {
        if (!bytes) return "null";
        var hex = [];
        for (var i = 0; i < bytes.length; i++) {
            var b = bytes[i] & 0xff;
            hex.push((b < 16 ? "0" : "") + b.toString(16));
        }
        return hex.join("");
    }

    // 1. SecretKeySpec Hook (Intercept Encryption Keys)
    SecretKeySpec.$init.overload('[B', 'java.lang.String').implementation = function (key, algorithm) {
        var keyHex = bytesToHex(key);
        console.log("\n[CRYPTO-KEY] Algorithm: " + algorithm);
        console.log("             Key (HEX): " + keyHex);
        try {
            console.log("             Key (RAW): " + StringClass.$new(key));
        } catch (e) {}
        return this.$init(key, algorithm);
    };

    // 2. IvParameterSpec Hook (Intercept Initialization Vectors)
    IvParameterSpec.$init.overload('[B').implementation = function (iv) {
        console.log("[CRYPTO-IV]  IV (HEX):  " + bytesToHex(iv));
        return this.$init(iv);
    };

    // 3. Cipher.doFinal Hook (Intercept Plaintext & Ciphertext)
    Cipher.doFinal.overload('[B').implementation = function (input) {
        var mode = this.getOpmode() === 1 ? "ENCRYPT" : "DECRYPT";
        var algo = this.getAlgorithm();
        console.log("\n[CIPHER] OpMode: " + mode + " | Algorithm: " + algo);
        if (input) {
            console.log("         Input (HEX):  " + bytesToHex(input));
            try {
                console.log("         Input (TXT):  " + StringClass.$new(input));
            } catch (e) {}
        }
        var output = this.doFinal(input);
        if (output) {
            console.log("         Output (HEX): " + bytesToHex(output));
        }
        return output;
    };

    console.log("[*] Crypto Sniffer Active");
});

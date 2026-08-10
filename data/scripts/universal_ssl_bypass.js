// Universal Android SSL Pinning Bypass
// Target: TrustManagerImpl, OkHttpClient, CertificatePinner, HttpsURLConnection, WebViewClient
Java.perform(function () {
    console.log("[*] Initializing Universal SSL Pinning Bypass...");

    // 1. TrustManagerImpl (Android N+)
    try {
        var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
        TrustManagerImpl.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
            console.log("[+] Bypassed Conscrypt TrustManagerImpl for host: " + host);
            return untrustedChain;
        };
    } catch (e) {
        console.log("[-] Conscrypt TrustManagerImpl not found");
    }

    // 2. OkHTTP 3 CertificatePinner
    try {
        var CertificatePinner = Java.use('okhttp3.CertificatePinner');
        CertificatePinner.check.overload('java.lang.String', 'java.util.List').implementation = function (str, list) {
            console.log("[+] Bypassed OkHTTP 3 CertificatePinner for: " + str);
            return;
        };
    } catch (e) {
        console.log("[-] OkHTTP 3 CertificatePinner not found");
    }

    // 3. HttpsURLConnection Default HostnameVerifier
    try {
        var HttpsURLConnection = Java.use("javax.net.ssl.HttpsURLConnection");
        HttpsURLConnection.setDefaultHostnameVerifier.implementation = function (hostnameVerifier) {
            console.log("[+] Bypassed setDefaultHostnameVerifier");
            return;
        };
    } catch (e) {}

    // 4. Custom TrustManager bypass
    try {
        var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
        var SSLContext = Java.use('javax.net.ssl.SSLContext');
        var TrustAll = Java.registerClass({
            name: 'com.rootraven.TrustAll',
            implements: [X509TrustManager],
            methods: {
                checkClientTrusted: function (chain, authType) {},
                checkServerTrusted: function (chain, authType) {},
                getAcceptedIssuers: function () { return []; }
            }
        });
        var trustAllManager = [TrustAll.$new()];
        var SSLContext_init = SSLContext.init.overload('[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom');
        SSLContext_init.implementation = function (km, tm, random) {
            console.log("[+] Injected TrustAll manager into SSLContext.init");
            SSLContext_init.call(this, km, trustAllManager, random);
        };
    } catch (e) {}

    console.log("[*] Universal SSL Pinning Hooks Ready");
});

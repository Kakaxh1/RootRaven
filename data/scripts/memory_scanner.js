// Frida script to scan process memory ranges for string matches
var searchPattern = "SEARCH_PATTERN_HERE";

function searchMemory() {
    console.log("[MemoryScanner] Starting scan for pattern: " + searchPattern);
    
    var matchesFound = 0;
    Process.enumerateRanges('r--').forEach(function (range) {
        try {
            var scanResults = Memory.scanSync(range.base, range.size, searchPattern);
            if (scanResults.length > 0) {
                scanResults.forEach(function (match) {
                    matchesFound++;
                    console.log("[MemoryScanner] MATCH found at address: " + match.address + " inside memory range: " + range.base);
                    try {
                        // Print dynamic contextual text dump from memory
                        var dumpSize = 32;
                        var dumpStart = match.address.sub(16);
                        var memoryDump = hexdump(dumpStart, {
                            offset: 0,
                            length: dumpSize,
                            header: true,
                            answers: true
                        });
                        console.log(memoryDump);
                    } catch (e) {
                        console.log("Match read error: " + e.message);
                    }
                });
            }
        } catch (e) {
            // Ignore memory access restriction errors
        }
    });

    console.log("[MemoryScanner] Scan complete. Found matches: " + matchesFound);
}

setImmediate(searchMemory);

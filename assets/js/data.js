/*
 * VAPT Navigator — content data
 * Original methodology notes, plain-language glossary, and command
 * references for common Vulnerability Assessment & Penetration Testing
 * domains. For use only against systems you are explicitly authorized
 * to test.
 */
window.VAPT_DATA = {
  meta: {
    name: "VAPT Navigator",
    tagline: "A field guide for vulnerability assessment & penetration testing",
    disclaimer:
      "Every technique here assumes a signed Rules of Engagement and explicit written authorization. Running these commands against systems you don't own or aren't contracted to test is illegal in most jurisdictions.",
  },

  methodology: [
    {
      phase: "Scoping & Rules of Engagement",
      short: "Agree on what, when, and how before touching anything.",
      detail:
        "Define in-scope assets, blackout windows, emergency contacts, and what counts as a stop condition. Get it signed before any command runs.",
    },
    {
      phase: "Reconnaissance",
      short: "Learn everything public about the target without touching it.",
      detail:
        "Passive collection of domains, IP ranges, technologies, employees, and exposed data. No packets hit the target yet.",
    },
    {
      phase: "Scanning & Enumeration",
      short: "Actively probe to find live hosts, open ports, and running services.",
      detail:
        "Turns the recon map into a concrete inventory: what's alive, what's listening, what version it's running.",
    },
    {
      phase: "Vulnerability Analysis",
      short: "Match what you found against known weaknesses.",
      detail:
        "Correlate service versions and configurations against CVEs, misconfiguration checklists, and manual testing to separate real issues from noise.",
    },
    {
      phase: "Exploitation",
      short: "Prove a weakness is real by (carefully) using it.",
      detail:
        "Controlled proof-of-concept exploitation to confirm impact — never further than the Rules of Engagement allow.",
    },
    {
      phase: "Post-Exploitation & Lateral Movement",
      short: "Show what an attacker could reach next.",
      detail:
        "From an initial foothold, demonstrate realistic blast radius: privilege escalation, pivoting, data access — always within agreed limits.",
    },
    {
      phase: "Reporting & Remediation Guidance",
      short: "Translate findings into fixes business stakeholders can act on.",
      detail:
        "Clear severity ratings (e.g. CVSS), reproduction steps, evidence, and concrete remediation advice — not just a tool dump.",
    },
    {
      phase: "Retesting",
      short: "Confirm the fixes actually closed the gap.",
      detail:
        "Re-run the original proof-of-concept after remediation to verify closure before the finding is marked resolved.",
    },
  ],

  globalGlossary: [
    { term: "VAPT", def: "Vulnerability Assessment and Penetration Testing — a combined process of scanning for known weaknesses (assessment) and actively trying to exploit them (testing) to prove real-world impact." },
    { term: "CVE", def: "Common Vulnerabilities and Exposures — a public ID number (e.g. CVE-2024-12345) assigned to a specific, publicly known security flaw." },
    { term: "CVSS", def: "Common Vulnerability Scoring System — a 0-10 score describing how severe a vulnerability is, based on factors like how easy it is to exploit and what it exposes." },
    { term: "Rules of Engagement (RoE)", def: "The signed document that defines what testers are allowed to do: scope, timing, techniques permitted, and emergency contacts." },
    { term: "Red Team vs. Pen Test vs. VAPT", def: "A vulnerability scan lists weaknesses automatically. A pen test manually proves specific weaknesses are exploitable. A red team engagement simulates a real adversary's full campaign, often without the defenders knowing in advance. VAPT usually refers to the first two combined." },
    { term: "Kill Chain", def: "The sequence of stages an attacker moves through to achieve an objective — recon, initial access, execution, persistence, escalation, exfiltration, and so on." },
    { term: "Zero-Day", def: "A vulnerability that is unknown to the vendor and has no official patch yet." },
    { term: "Proof of Concept (PoC)", def: "A minimal, working demonstration that a vulnerability is real and exploitable — evidence, not a full attack." },
    { term: "False Positive", def: "A finding an automated scanner reports that turns out, on manual verification, not to be a real vulnerability." },
    { term: "Attack Surface", def: "Everything about a system that could potentially be attacked: exposed ports, forms, APIs, third-party integrations, employees, and so on." },
  ],

  categories: [
    {
      id: "recon",
      icon: "recon",
      name: "Reconnaissance & OSINT",
      tagline: "Map the target before you ever touch it",
      overview:
        "Reconnaissance is the information-gathering phase — figuring out what a target actually looks like from the outside: its domains, IP ranges, technology stack, exposed people, and forgotten assets. Good recon does most of the heavy lifting for every phase that follows, because you can't test what you don't know exists.",
      jargon: [
        { term: "OSINT", def: "Open-Source Intelligence — information gathered from publicly available sources (search engines, social media, public records, code repos) rather than by directly probing the target." },
        { term: "Passive Recon", def: "Collecting information without sending any traffic to the target's systems — e.g. searching public records or third-party databases." },
        { term: "Active Recon", def: "Collecting information by directly interacting with the target's systems — e.g. sending DNS queries or connecting to a server." },
        { term: "Subdomain Enumeration", def: "Discovering the full set of subdomains (like dev.example.com, api.example.com) belonging to a target domain, since forgotten subdomains are often the weakest link." },
        { term: "DNS Zone Transfer", def: "A misconfiguration where a DNS server hands over its entire internal domain record list to anyone who asks, leaking internal hostnames." },
        { term: "ASN", def: "Autonomous System Number — an ID identifying a block of IP address space owned by an organization, useful for mapping their full network footprint." },
      ],
      checklist: [
        {
          title: "Passive Recon",
          items: [
            "Identify the organization's registered domains and ASN / IP ranges",
            "Enumerate subdomains via certificate transparency logs and passive DNS",
            "Search code repositories (GitHub/GitLab) for leaked credentials or internal hostnames",
            "Identify employee names, roles, and email format for later social-engineering-aware reporting",
            "Check breach databases for previously leaked credentials tied to the domain",
          ],
        },
        {
          title: "Active Recon",
          items: [
            "Resolve discovered subdomains to live IPs",
            "Attempt a DNS zone transfer against authoritative nameservers",
            "Fingerprint web technologies (CMS, framework, CDN, WAF) on live hosts",
            "Take screenshots of all live web hosts for fast triage",
          ],
        },
        {
          title: "Attack Surface Mapping",
          items: [
            "Consolidate all findings into a single asset inventory (host, port, service, owner)",
            "Flag anything out of the agreed scope and confirm with the client before proceeding",
          ],
        },
      ],
      commands: [
        { tool: "whois", purpose: "Look up domain registration and ownership records", syntax: "whois <domain>" },
        { tool: "dig", purpose: "Query DNS records directly, including attempting a zone transfer", syntax: "dig <domain> ANY\ndig axfr @<nameserver> <domain>" },
        { tool: "subfinder", purpose: "Passively enumerate subdomains from multiple public sources", syntax: "subfinder -d <domain> -o subs.txt" },
        { tool: "amass", purpose: "Combine passive and active subdomain enumeration with graph output", syntax: "amass enum -d <domain> -o amass_subs.txt" },
        { tool: "httpx", purpose: "Probe a list of hosts to see which are alive over HTTP/S and fingerprint them", syntax: "cat subs.txt | httpx -title -tech-detect -status-code" },
        { tool: "theHarvester", purpose: "Gather emails, names, and hosts from public search engines and PGP servers", syntax: "theHarvester -d <domain> -b all" },
        { tool: "crt.sh lookup", purpose: "Pull subdomains from certificate transparency logs", syntax: "curl -s \"https://crt.sh/?q=%25.<domain>&output=json\" | jq -r '.[].name_value' | sort -u" },
        { tool: "gowitness", purpose: "Bulk screenshot live web hosts for fast visual triage", syntax: "gowitness file -f subs_live.txt" },
      ],
      tools: [
        { name: "Shodan", use: "Search engine for internet-connected devices and exposed services" },
        { name: "Censys", use: "Internet-wide scan data for hosts, certificates, and services" },
        { name: "Amass", use: "OWASP subdomain and attack-surface mapping toolkit" },
        { name: "SpiderFoot", use: "Automated OSINT aggregation across 100+ data sources" },
        { name: "Maltego", use: "Visual link-analysis for connecting OSINT entities" },
        { name: "theHarvester", use: "Email, subdomain, and employee-name harvesting" },
      ],
    },

    {
      id: "network",
      icon: "network",
      name: "Network Penetration Testing",
      tagline: "Find and exploit weaknesses in hosts and network services",
      overview:
        "Network pentesting targets the infrastructure layer: which hosts are alive, what services they run, and whether those services are outdated, misconfigured, or exploitable. It typically progresses from a broad discovery sweep down to service-specific exploitation and, where authorized, lateral movement across the network.",
      jargon: [
        { term: "Port Scanning", def: "Systematically checking which network ports on a host are open, closed, or filtered, to learn what services are exposed." },
        { term: "Service Enumeration", def: "Identifying exactly what software and version is running behind an open port." },
        { term: "Banner Grabbing", def: "Connecting to a service and reading the identifying text it returns (often reveals software name/version)." },
        { term: "Lateral Movement", def: "Moving from one compromised machine to another inside the same network." },
        { term: "Pivoting", def: "Using a compromised host as a relay point to reach network segments that weren't directly reachable before." },
        { term: "Privilege Escalation", def: "Going from a limited-access account to a more powerful one (e.g. user to admin/root)." },
        { term: "Firewall Evasion", def: "Techniques to get scan or attack traffic past a firewall's filtering rules without being blocked or detected." },
      ],
      checklist: [
        {
          title: "Discovery",
          items: [
            "Sweep the in-scope IP ranges to identify live hosts",
            "Confirm the host list against the agreed scope document",
          ],
        },
        {
          title: "Scanning & Enumeration",
          items: [
            "Full TCP port scan on all live hosts (not just top-1000)",
            "Service/version detection on every open port",
            "UDP scan on hosts offering DNS, SNMP, or other UDP-heavy services",
            "Enumerate SMB shares, NFS exports, and null sessions where present",
          ],
        },
        {
          title: "Vulnerability Analysis",
          items: [
            "Match identified service versions against known CVEs",
            "Run an authenticated/unauthenticated vulnerability scan for defense-in-depth coverage",
            "Manually verify high-severity automated findings before reporting them",
          ],
        },
        {
          title: "Exploitation & Post-Exploitation",
          items: [
            "Attempt controlled exploitation of confirmed vulnerabilities per the RoE",
            "Document privilege escalation paths found on compromised hosts",
            "Map any lateral movement / pivoting opportunities discovered",
          ],
        },
      ],
      commands: [
        { tool: "nmap (host discovery)", purpose: "Find live hosts on a subnet without full port scanning", syntax: "nmap -sn 10.10.10.0/24" },
        { tool: "nmap (full TCP scan)", purpose: "Scan all 65535 TCP ports", syntax: "nmap -p- -T4 <target>" },
        { tool: "nmap (service/version)", purpose: "Identify service names, versions, and run default scripts", syntax: "nmap -sV -sC -p <ports> <target>" },
        { tool: "masscan", purpose: "Very fast port scanning across large ranges before deep-diving with nmap", syntax: "masscan -p1-65535 <cidr> --rate 10000" },
        { tool: "enum4linux-ng", purpose: "Enumerate SMB users, shares, and policies on Windows/Samba hosts", syntax: "enum4linux-ng -A <target>" },
        { tool: "smbclient", purpose: "Manually browse and connect to SMB shares", syntax: "smbclient -L //<target>/ -N" },
        { tool: "netcat", purpose: "Manually grab a service banner or open a raw connection", syntax: "nc -nv <target> <port>" },
        { tool: "searchsploit", purpose: "Search a local exploit database offline by service/version", syntax: "searchsploit <service> <version>" },
      ],
      tools: [
        { name: "Nmap", use: "The standard network discovery and port scanning engine" },
        { name: "Masscan", use: "Internet-scale, high-speed port scanner" },
        { name: "Metasploit Framework", use: "Exploit development and execution framework" },
        { name: "Wireshark", use: "Packet capture and protocol analysis" },
        { name: "CrackMapExec / NetExec", use: "Swiss-army-knife for enumerating and attacking Windows networks" },
        { name: "Nessus / OpenVAS", use: "Automated vulnerability scanners for broad coverage" },
      ],
    },

    {
      id: "webapp",
      icon: "web",
      name: "Web Application Pentesting",
      tagline: "Break the logic and trust boundaries of web apps",
      overview:
        "Web application testing looks past the network layer into the application itself — how it authenticates users, validates input, and enforces business rules. Most real-world breaches trace back to flaws here: broken access control, injection, and logic bugs that a firewall can't stop because the traffic looks legitimate.",
      jargon: [
        { term: "OWASP Top 10", def: "A regularly updated list of the ten most critical web application security risks, maintained by the OWASP community — the industry's baseline checklist." },
        { term: "Injection", def: "Feeding an application untrusted input that gets interpreted as code or commands instead of plain data (e.g. SQL Injection, Command Injection)." },
        { term: "XSS (Cross-Site Scripting)", def: "Injecting malicious script into a page that then runs in other users' browsers." },
        { term: "CSRF (Cross-Site Request Forgery)", def: "Tricking a logged-in user's browser into submitting an unwanted request to a site they're authenticated on." },
        { term: "IDOR (Insecure Direct Object Reference)", def: "Changing an ID in a request (like an order or account number) to access another user's data because the server never checked ownership." },
        { term: "SSRF (Server-Side Request Forgery)", def: "Tricking a server into making requests to internal systems it wasn't meant to expose, on the attacker's behalf." },
        { term: "Authentication vs. Authorization", def: "Authentication proves who you are (login). Authorization decides what you're allowed to do once logged in. Bugs often confuse the two." },
        { term: "Business Logic Flaw", def: "A vulnerability that doesn't come from broken code, but from an application doing exactly what it was built to do in an order or combination the designers didn't anticipate (e.g. applying a discount coupon twice)." },
      ],
      checklist: [
        {
          title: "Recon & Mapping",
          items: [
            "Crawl and manually walk the application to build a full sitemap",
            "Brute-force hidden directories, files, and parameters",
            "Identify the technology stack, frameworks, and third-party components in use",
            "Note every place the app accepts user input (forms, headers, cookies, query strings)",
          ],
        },
        {
          title: "Authentication & Session Testing",
          items: [
            "Test for weak password policy, account enumeration, and lack of rate limiting on login",
            "Check session token randomness, expiry, and invalidation on logout",
            "Test for privilege escalation between roles (user → admin)",
          ],
        },
        {
          title: "Input Validation Testing",
          items: [
            "Test all inputs for SQL/NoSQL/command injection",
            "Test for reflected, stored, and DOM-based XSS",
            "Test for SSRF on any input that triggers a server-side fetch (URLs, webhooks, PDF generators)",
            "Test file upload functionality for type/extension bypass and path traversal",
          ],
        },
        {
          title: "Business Logic & Reporting",
          items: [
            "Test multi-step workflows for logic bypass (e.g. skipping payment steps)",
            "Verify security headers and cookie flags (HttpOnly, Secure, SameSite)",
            "Compile evidence with reproduction steps and CVSS scoring for every confirmed finding",
          ],
        },
      ],
      commands: [
        { tool: "whatweb", purpose: "Fingerprint the web technology stack of a target", syntax: "whatweb -a 3 <url>" },
        { tool: "ffuf (directory brute-force)", purpose: "Fuzz for hidden directories and files at speed", syntax: "ffuf -u https://<target>/FUZZ -w wordlist.txt -mc 200,301,302" },
        { tool: "gobuster", purpose: "Alternative fast directory/DNS brute-forcer", syntax: "gobuster dir -u https://<target> -w wordlist.txt -x php,html" },
        { tool: "nikto", purpose: "Automated scan for common web server misconfigurations", syntax: "nikto -h <url>" },
        { tool: "sqlmap", purpose: "Automate detection and exploitation of SQL injection", syntax: "sqlmap -u \"<url>?id=1\" --batch --dbs" },
        { tool: "nuclei", purpose: "Run community-maintained templates to spot known CVEs and misconfigurations fast", syntax: "nuclei -u <url> -t cves/ -t misconfiguration/" },
        { tool: "curl (security headers check)", purpose: "Quickly inspect response headers for missing security controls", syntax: "curl -sI <url>" },
        { tool: "wpscan", purpose: "Scan WordPress sites for vulnerable plugins, themes, and users", syntax: "wpscan --url <url> --enumerate vp,vt,u" },
      ],
      tools: [
        { name: "Burp Suite", use: "The industry-standard intercepting proxy for manual and semi-automated web testing" },
        { name: "OWASP ZAP", use: "Free, open-source intercepting proxy and active/passive scanner" },
        { name: "sqlmap", use: "Automated SQL injection exploitation" },
        { name: "ffuf / gobuster", use: "High-speed content and parameter fuzzing" },
        { name: "Nuclei", use: "Template-driven vulnerability scanning at scale" },
      ],
    },

    {
      id: "api",
      icon: "api",
      name: "API Security Testing",
      tagline: "Test the machine-to-machine layer directly",
      overview:
        "APIs skip the browser entirely, which means a lot of client-side protections (like hidden UI elements) don't apply — every check has to happen server-side. API testing focuses heavily on authorization logic, since the most common and damaging API flaws come from one user being able to act on another user's data.",
      jargon: [
        { term: "REST vs. GraphQL", def: "REST exposes many fixed endpoints (one per resource/action). GraphQL exposes a single flexible endpoint where the client asks for exactly the data it wants — powerful, but easy to over-expose data through if not locked down." },
        { term: "BOLA (Broken Object Level Authorization)", def: "The API lets a user request another user's object (e.g. /invoices/1002) just by changing an ID, without checking they actually own it. The single most common serious API flaw." },
        { term: "Mass Assignment", def: "An endpoint blindly accepts and applies every field in a request body, letting an attacker set fields they shouldn't control (like isAdmin: true)." },
        { term: "Rate Limiting", def: "Restricting how many requests a client can make in a given time window, to prevent abuse like brute-forcing or scraping." },
        { term: "JWT (JSON Web Token)", def: "A compact, signed token format commonly used for API authentication — vulnerable if the signature isn't properly verified or a weak signing algorithm is accepted." },
        { term: "API Gateway", def: "A layer in front of backend APIs that centralizes authentication, rate limiting, and routing." },
      ],
      checklist: [
        {
          title: "Discovery & Documentation Review",
          items: [
            "Collect the API specification (OpenAPI/Swagger/GraphQL schema) if available",
            "Brute-force for undocumented or versioned endpoints (e.g. /v1/, /v2/, /internal/)",
            "Catalog every endpoint, method, and expected parameter",
          ],
        },
        {
          title: "AuthN / AuthZ Testing",
          items: [
            "Test every endpoint as a lower-privileged user against another user's object IDs (BOLA)",
            "Test for missing function-level authorization (can a regular user hit admin-only endpoints?)",
            "Attack the JWT: alg=none, weak secret brute-force, and signature stripping",
          ],
        },
        {
          title: "Input & Business Logic Testing",
          items: [
            "Send extra/unexpected fields to test for mass assignment",
            "Test injection on every parameter, not just obvious search fields",
            "Test pagination, filtering, and export endpoints for bulk data exposure",
          ],
        },
        {
          title: "Rate Limit & Resilience Checks",
          items: [
            "Confirm rate limiting exists on authentication and sensitive endpoints",
            "Check for verbose error messages leaking stack traces or internal paths",
          ],
        },
      ],
      commands: [
        { tool: "curl (method enumeration)", purpose: "Check which HTTP methods an endpoint accepts", syntax: "curl -X OPTIONS -i <url>/api/resource" },
        { tool: "ffuf (endpoint fuzz)", purpose: "Discover hidden or versioned API paths", syntax: "ffuf -u https://<target>/api/FUZZ -w api-wordlist.txt" },
        { tool: "kiterunner", purpose: "Fuzz for API routes using realistic route wordlists derived from real specs", syntax: "kr scan https://<target> -w routes-large.kite" },
        { tool: "jwt_tool", purpose: "Test JWTs for algorithm confusion, weak secrets, and tampering", syntax: "python3 jwt_tool.py <token> -M at" },
        { tool: "GraphQL introspection", purpose: "Pull the full schema from a GraphQL endpoint if introspection is left enabled", syntax: "curl -s -X POST <url>/graphql -H 'Content-Type: application/json' -d '{\"query\":\"{__schema{types{name}}}\"}'" },
        { tool: "arjun", purpose: "Discover hidden HTTP parameters an endpoint silently accepts", syntax: "arjun -u <url>/api/resource" },
      ],
      tools: [
        { name: "Postman / Newman", use: "Manual API exploration and scripted regression testing" },
        { name: "Kiterunner", use: "Content discovery purpose-built for API routes" },
        { name: "jwt_tool", use: "JWT security testing toolkit" },
        { name: "Burp Suite", use: "Proxying and repeating API requests during manual testing" },
        { name: "GraphQL Voyager", use: "Visualize a GraphQL schema for easier BOLA hunting" },
      ],
    },

    {
      id: "mobile",
      icon: "mobile",
      name: "Mobile App Pentesting",
      tagline: "Static and dynamic testing for Android & iOS apps",
      overview:
        "Mobile testing covers three angles at once: what's baked into the installed app package (static), how the app behaves while actually running (dynamic), and what it sends over the network. A lot of mobile risk comes from developers assuming the device is a trusted environment — it isn't, since the attacker can fully control it.",
      jargon: [
        { term: "APK / IPA", def: "The installable package format for Android (.apk) and iOS (.ipa) apps — effectively a zip file containing code, resources, and configuration." },
        { term: "Static Analysis", def: "Examining the app's code and configuration without running it — decompiling and reading the source." },
        { term: "Dynamic Analysis", def: "Observing the app's actual behavior while it runs, e.g. hooking functions or watching what it stores at runtime." },
        { term: "SSL Pinning", def: "The app hardcodes which TLS certificate it trusts, refusing to talk over a connection intercepted by a testing proxy — must be bypassed to inspect traffic." },
        { term: "Root / Jailbreak Detection", def: "Code in the app that tries to detect if the device has been rooted (Android) or jailbroken (iOS) and refuses to run — often bypassable." },
        { term: "Insecure Storage", def: "Sensitive data (tokens, PII, credentials) saved in plaintext in local files, shared preferences, or logs where any app or a rooted user could read it." },
        { term: "Deep Link", def: "A custom URL scheme (like myapp://reset-password?token=X) that opens the app directly to a specific screen — can be abused if not validated." },
      ],
      checklist: [
        {
          title: "Static Analysis",
          items: [
            "Decompile the app and review source for hardcoded secrets/API keys",
            "Review the manifest/plist for excessive permissions and exported components",
            "Check for weak or missing code obfuscation on sensitive logic",
          ],
        },
        {
          title: "Dynamic Analysis",
          items: [
            "Bypass SSL pinning to intercept traffic through a testing proxy",
            "Bypass root/jailbreak detection if present",
            "Hook sensitive functions (crypto, auth checks) to observe or manipulate runtime behavior",
          ],
        },
        {
          title: "Network Traffic Analysis",
          items: [
            "Confirm all traffic is encrypted (no cleartext HTTP)",
            "Check API calls made by the app for the same issues covered in API testing (BOLA, weak auth)",
          ],
        },
        {
          title: "Storage & Data-at-Rest Review",
          items: [
            "Inspect local databases, shared preferences, and cache for sensitive data",
            "Check clipboard, screenshot/app-switcher snapshot, and log output for data leakage",
          ],
        },
      ],
      commands: [
        { tool: "apktool", purpose: "Decompile an APK into readable smali/resources", syntax: "apktool d app.apk -o app_decompiled" },
        { tool: "jadx-gui", purpose: "Decompile an APK to near-original Java source", syntax: "jadx-gui app.apk" },
        { tool: "adb (pull app data)", purpose: "Pull an app's local storage off a test device for review", syntax: "adb shell run-as <package> ls /data/data/<package>\nadb pull /data/data/<package>" },
        { tool: "MobSF", purpose: "Automated static + dynamic analysis via a local scanning server", syntax: "docker run -it -p 8000:8000 opensecurity/mobile-security-framework-mobsf" },
        { tool: "frida-ps", purpose: "List running processes on a device attached for Frida instrumentation", syntax: "frida-ps -U" },
        { tool: "objection", purpose: "Runtime mobile exploration — bypass SSL pinning and root detection interactively", syntax: "objection -g <package> explore" },
      ],
      tools: [
        { name: "MobSF", use: "All-in-one static and dynamic mobile app scanner" },
        { name: "Jadx / Apktool", use: "Android decompilation and rebuilding" },
        { name: "Frida", use: "Dynamic instrumentation toolkit for hooking app functions at runtime" },
        { name: "Objection", use: "Frida-powered runtime exploration without needing a jailbreak/root" },
        { name: "Burp Suite", use: "Intercepting mobile app network traffic" },
        { name: "Drozer", use: "Android inter-component (IPC) attack surface testing" },
      ],
    },

    {
      id: "cloud",
      icon: "cloud",
      name: "Cloud Security Assessment",
      tagline: "AWS, Azure & GCP configuration and identity review",
      overview:
        "Cloud assessments focus less on exploiting software bugs and more on finding dangerous configuration: over-permissive identities, publicly exposed storage, and gaps in logging. Because cloud providers secure the underlying infrastructure, nearly every real-world cloud breach traces back to a customer-side misconfiguration.",
      jargon: [
        { term: "IAM (Identity and Access Management)", def: "The system controlling who (users, services, roles) can do what within a cloud account — the single most impactful thing to review in a cloud assessment." },
        { term: "Shared Responsibility Model", def: "The cloud provider secures the underlying platform; the customer is responsible for securing what they configure on top of it (data, access, network rules)." },
        { term: "Misconfiguration", def: "A setting left in an insecure state by the customer — e.g. a storage bucket set to public — rather than a flaw in the provider's own platform." },
        { term: "Privilege Escalation Path", def: "A chain of permissions that lets an identity with limited access reach a more powerful role or credential than intended." },
        { term: "Metadata Service (IMDS)", def: "An internal endpoint (like 169.254.169.254) cloud instances use to fetch their own credentials — a frequent SSRF exploitation target." },
        { term: "CSPM (Cloud Security Posture Management)", def: "Tools that continuously scan a cloud environment against best-practice benchmarks (e.g. CIS Benchmarks)." },
      ],
      checklist: [
        {
          title: "Identity & Access Review",
          items: [
            "Enumerate all IAM users, roles, and service accounts and their attached policies",
            "Look for wildcard (*) permissions and unused overly-broad roles",
            "Check for privilege escalation chains between roles",
            "Confirm MFA is enforced on privileged accounts",
          ],
        },
        {
          title: "Storage & Data Exposure Review",
          items: [
            "Check all storage buckets/containers for public read/write access",
            "Verify encryption at rest is enabled on databases and storage",
            "Check for exposed database or cache instances directly reachable from the internet",
          ],
        },
        {
          title: "Network & Perimeter Review",
          items: [
            "Review security groups / NSGs / firewall rules for overly permissive ingress (0.0.0.0/0)",
            "Confirm the instance metadata service isn't reachable via an SSRF-prone application",
          ],
        },
        {
          title: "Logging & Monitoring Review",
          items: [
            "Confirm audit logging (CloudTrail/Activity Log/Cloud Audit Logs) is enabled account-wide",
            "Check that alerting exists for high-risk actions (IAM changes, root/owner login)",
          ],
        },
      ],
      commands: [
        { tool: "AWS CLI (public bucket check)", purpose: "Check a bucket's public access configuration", syntax: "aws s3api get-bucket-acl --bucket <name>\naws s3api get-public-access-block --bucket <name>" },
        { tool: "Prowler", purpose: "Run hundreds of AWS/Azure/GCP security best-practice checks in one pass", syntax: "prowler aws" },
        { tool: "ScoutSuite", purpose: "Multi-cloud security auditing with an HTML findings report", syntax: "scout aws" },
        { tool: "AWS CLI (IAM policy simulation)", purpose: "Test what a given identity is actually allowed to do", syntax: "aws iam simulate-principal-policy --policy-source-arn <arn> --action-names s3:GetObject" },
        { tool: "az cli (list role assignments)", purpose: "Enumerate Azure RBAC role assignments for review", syntax: "az role assignment list --all -o table" },
        { tool: "gcloud (IAM policy dump)", purpose: "Pull the full IAM policy bindings for a GCP project", syntax: "gcloud projects get-iam-policy <project-id>" },
      ],
      tools: [
        { name: "Prowler", use: "Multi-cloud CIS-benchmark and best-practice auditing" },
        { name: "ScoutSuite", use: "Open-source multi-cloud security auditing tool" },
        { name: "Pacu", use: "AWS exploitation framework for post-compromise testing" },
        { name: "CloudSploit", use: "Cloud configuration scanning" },
        { name: "Steampipe", use: "SQL-queryable interface over live cloud configuration for custom checks" },
      ],
    },

    {
      id: "ad",
      icon: "ad",
      name: "Active Directory Pentesting",
      tagline: "Enterprise Windows domain attack paths",
      overview:
        "Active Directory is the identity backbone of most enterprise networks, which makes it the single highest-value target inside an internal network test. AD assessments trace the path from an ordinary low-privilege domain account all the way to Domain Admin, usually through a chain of small misconfigurations rather than one big bug.",
      jargon: [
        { term: "Domain Controller", def: "The server that holds and enforces Active Directory's user accounts, permissions, and policies for the whole network." },
        { term: "Kerberoasting", def: "Requesting service tickets for accounts with a Service Principal Name and cracking them offline to recover the service account's password." },
        { term: "AS-REP Roasting", def: "Extracting crackable authentication hashes for accounts that have Kerberos pre-authentication disabled." },
        { term: "Pass-the-Hash", def: "Authenticating using a stolen password hash directly, without ever needing to know or crack the plaintext password." },
        { term: "Golden / Silver Ticket", def: "Forged Kerberos tickets that grant an attacker persistent, often nearly-undetectable, access across the domain (Golden) or to a specific service (Silver)." },
        { term: "LDAP", def: "The protocol Active Directory uses to store and query directory information — often queryable by any authenticated (or even anonymous) user for recon." },
        { term: "Trust Relationship", def: "A configured link letting users in one AD domain/forest access resources in another — a common lateral pivot point between environments." },
      ],
      checklist: [
        {
          title: "Enumeration",
          items: [
            "Enumerate domain users, groups, and computers via LDAP",
            "Build the domain's attack-path graph (who can reach Domain Admin, and how)",
            "Identify accounts with SPNs set (Kerberoasting targets) and pre-auth disabled (AS-REP targets)",
          ],
        },
        {
          title: "Credential Attacks",
          items: [
            "Attempt Kerberoasting and AS-REP Roasting against identified accounts",
            "Password-spray common/seasonal passwords against the full user list at a safe rate",
            "Check for credentials left in SYSVOL scripts, GPOs, or unattended install files",
          ],
        },
        {
          title: "Lateral Movement",
          items: [
            "Test pass-the-hash / pass-the-ticket against reachable hosts with recovered credentials",
            "Hunt for local admin reuse across multiple machines",
          ],
        },
        {
          title: "Domain Privilege Escalation",
          items: [
            "Map and validate the shortest attack path to Domain Admin found during enumeration",
            "Review trust relationships for cross-domain/forest escalation opportunities",
          ],
        },
      ],
      commands: [
        { tool: "bloodhound-python", purpose: "Collect AD data for BloodHound attack-path graphing from Linux", syntax: "bloodhound-python -u <user> -p <pass> -d <domain> -c all" },
        { tool: "crackmapexec / netexec", purpose: "Enumerate SMB, spray credentials, and validate access across many hosts at once", syntax: "netexec smb <cidr> -u <user> -p <pass>" },
        { tool: "impacket GetUserSPNs", purpose: "Kerberoast: request and dump crackable service ticket hashes", syntax: "GetUserSPNs.py <domain>/<user>:<pass> -dc-ip <dc-ip> -request" },
        { tool: "impacket GetNPUsers", purpose: "AS-REP Roast accounts with Kerberos pre-auth disabled", syntax: "GetNPUsers.py <domain>/ -usersfile users.txt -no-pass -dc-ip <dc-ip>" },
        { tool: "impacket secretsdump", purpose: "Dump local/domain credential material from a compromised host", syntax: "secretsdump.py <domain>/<user>:<pass>@<target>" },
        { tool: "ldapsearch", purpose: "Query AD directly over LDAP for users, groups, and attributes", syntax: "ldapsearch -x -H ldap://<dc-ip> -D \"<user>@<domain>\" -w <pass> -b \"DC=<domain>,DC=com\"" },
      ],
      tools: [
        { name: "BloodHound", use: "Graphs AD relationships to find the shortest path to Domain Admin" },
        { name: "Impacket", use: "Python library and scripts for low-level AD/SMB/Kerberos protocol attacks" },
        { name: "CrackMapExec / NetExec", use: "Post-exploitation and enumeration swiss-army-knife for Windows networks" },
        { name: "Rubeus", use: "Windows-native Kerberos abuse toolkit" },
        { name: "PowerView / PowerSploit", use: "PowerShell-based AD enumeration and attack modules" },
      ],
    },

    {
      id: "wireless",
      icon: "wireless",
      name: "Wireless (Wi-Fi) Pentesting",
      tagline: "Assess the security of wireless networks and clients",
      overview:
        "Wireless testing evaluates both the access point (encryption strength, configuration) and the clients connecting to it (whether they can be tricked into joining a fake network). Because wireless signals aren't confined by a network cable, exposure often extends well beyond the physical walls of a building.",
      jargon: [
        { term: "WPA2 / WPA3", def: "The current standard Wi-Fi encryption protocols; WPA3 is newer and more resistant to offline password-guessing attacks than WPA2." },
        { term: "Handshake Capture", def: "Capturing the exchange that happens when a device joins a WPA2 network, which can then be attacked offline to recover the password." },
        { term: "PMKID", def: "A piece of data some routers send that allows capturing crackable authentication material without needing to wait for a client to connect." },
        { term: "Deauthentication Attack", def: "Forcibly disconnecting a client from a network to force it to reconnect — used to capture a fresh handshake." },
        { term: "Evil Twin", def: "A rogue access point set up to mimic a legitimate network's name (SSID), tricking devices into connecting to it instead." },
        { term: "Rogue AP", def: "Any unauthorized access point broadcasting on the network, whether malicious or just an employee's unmanaged hotspot." },
      ],
      checklist: [
        {
          title: "Discovery",
          items: [
            "Survey the area for all in-scope access points and their encryption type",
            "Identify hidden SSIDs and rogue/unauthorized access points",
          ],
        },
        {
          title: "Handshake / PMKID Capture",
          items: [
            "Capture the WPA2 handshake for target networks",
            "Attempt PMKID capture where supported by the access point",
          ],
        },
        {
          title: "Offline Cracking",
          items: [
            "Run the captured handshake/PMKID against a wordlist and rule-based attack",
            "Document the time-to-crack as evidence of password strength (or weakness)",
          ],
        },
        {
          title: "Rogue AP / Client-Side Testing",
          items: [
            "Stand up an authorized evil-twin test to measure how many clients auto-connect",
            "Review client device configuration for auto-connect to open/unknown networks",
          ],
        },
      ],
      commands: [
        { tool: "airmon-ng", purpose: "Put a wireless adapter into monitor mode", syntax: "airmon-ng start wlan0" },
        { tool: "airodump-ng", purpose: "Discover nearby networks and capture handshakes", syntax: "airodump-ng wlan0mon" },
        { tool: "aireplay-ng (deauth)", purpose: "Send deauthentication frames to force a handshake", syntax: "aireplay-ng --deauth 5 -a <bssid> wlan0mon" },
        { tool: "hcxdumptool", purpose: "Capture PMKID and handshake data in hashcat-ready format", syntax: "hcxdumptool -i wlan0mon -o capture.pcapng" },
        { tool: "hashcat (WPA crack)", purpose: "Crack a captured handshake/PMKID against a wordlist", syntax: "hashcat -m 22000 capture.hc22000 wordlist.txt" },
        { tool: "wifite", purpose: "Automate the discovery-to-capture workflow across multiple networks", syntax: "wifite --kill" },
      ],
      tools: [
        { name: "Aircrack-ng suite", use: "The foundational Wi-Fi auditing toolkit (capture, injection, cracking)" },
        { name: "Wifite", use: "Automates common wireless attack workflows" },
        { name: "Hashcat", use: "GPU-accelerated password/handshake cracking" },
        { name: "Kismet", use: "Wireless network detection and intrusion detection" },
        { name: "Bettercap", use: "Wireless and network man-in-the-middle testing framework" },
      ],
    },

    {
      id: "container",
      icon: "container",
      name: "Container & Kubernetes Assessment",
      tagline: "Secure the container images, cluster config, and runtime",
      overview:
        "Container and Kubernetes assessments span three layers: the images being deployed (do they contain known-vulnerable packages?), the cluster's own configuration (is access control tight?), and what's happening at runtime (can a compromised container escape its boundary?). Misconfigurations here tend to have an outsized blast radius since a cluster typically hosts many workloads at once.",
      jargon: [
        { term: "Image Scanning", def: "Analyzing a container image's installed packages against known-vulnerability databases before it's ever deployed." },
        { term: "Privileged Container", def: "A container run with expanded host permissions, effectively removing most of the isolation containers are supposed to provide." },
        { term: "RBAC (Role-Based Access Control)", def: "Kubernetes' permission system controlling which users/service accounts can perform which actions on which resources." },
        { term: "Pod Security", def: "Policies restricting what a pod is allowed to do — e.g. blocking privileged mode, host networking, or running as root." },
        { term: "Namespace Isolation", def: "Kubernetes namespaces logically separate resources, but by default don't fully isolate network traffic between them — a common false assumption." },
        { term: "Container Escape", def: "Breaking out of a container's isolation to gain access to the underlying host or other containers." },
        { term: "Supply Chain Risk", def: "Risk introduced through third-party base images, dependencies, or build pipelines rather than code you wrote yourself." },
      ],
      checklist: [
        {
          title: "Image & Registry Review",
          items: [
            "Scan all deployed images for known-vulnerable packages",
            "Check for hardcoded secrets baked into image layers",
            "Confirm the registry restricts push access and images are signed/verified where required",
          ],
        },
        {
          title: "Cluster Configuration Review",
          items: [
            "Run a CIS Kubernetes Benchmark check against the cluster",
            "Check the API server for anonymous or overly permissive access",
            "Review network policies for unrestricted pod-to-pod traffic",
          ],
        },
        {
          title: "RBAC & Secrets Review",
          items: [
            "Enumerate roles/clusterroles for excessive permissions (wildcard verbs/resources)",
            "Check how Kubernetes Secrets are stored and whether encryption at rest is enabled",
          ],
        },
        {
          title: "Runtime Security Review",
          items: [
            "Identify pods running as privileged, root, or with hostPath/hostNetwork mounts",
            "Test for container escape opportunities on any privileged workloads found",
          ],
        },
      ],
      commands: [
        { tool: "trivy (image scan)", purpose: "Scan a container image for known vulnerabilities and secrets", syntax: "trivy image <image:tag>" },
        { tool: "kube-hunter", purpose: "Actively probe a cluster for exploitable weaknesses from inside or outside", syntax: "kube-hunter --remote <cluster-ip>" },
        { tool: "kube-bench", purpose: "Check a cluster's configuration against the CIS Kubernetes Benchmark", syntax: "kube-bench run --targets master,node" },
        { tool: "kubectl (auth check)", purpose: "Check what actions the current identity is permitted to perform", syntax: "kubectl auth can-i --list" },
        { tool: "kubectl (privileged pod hunt)", purpose: "Find pods running with privileged or host-mount access", syntax: "kubectl get pods -A -o json | jq '.items[] | select(.spec.containers[].securityContext.privileged==true)'" },
        { tool: "docker inspect", purpose: "Review a running container's security-relevant configuration", syntax: "docker inspect <container> | jq '.[0].HostConfig.Privileged, .[0].HostConfig.Binds'" },
      ],
      tools: [
        { name: "Trivy", use: "Vulnerability, secret, and misconfiguration scanning for images and IaC" },
        { name: "kube-hunter", use: "Active Kubernetes cluster penetration testing" },
        { name: "kube-bench", use: "CIS Benchmark compliance checking for Kubernetes" },
        { name: "Falco", use: "Runtime threat detection for containers and Kubernetes" },
        { name: "kubeaudit", use: "Audits Kubernetes clusters against security best practices" },
      ],
    },
  ],
};

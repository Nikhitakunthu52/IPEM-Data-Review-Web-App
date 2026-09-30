# IPEM-Data-Review-Web-App

**Project Timeline**

Duration: Wed Sep 30 – Fri Nov 6, 2026 (5½ weeks) · Buffer / handover: Nov 9–13

We are building a web app that pulls voltage, current and temperature data from the lab's InfluxDB and sends alerts on temperature. A mobile app will come in a later phase and will use the same API.

**Team**
**Person	Role	Owns**
**Nikhita**	Lead	Architecture, server access, backend API, integration, status updates at Monday team meetings
**Shreya**	Frontend developer	Web UI, charts, device pages, alert display
**Ayush**	Backend / data developer	InfluxDB queries, MAC-to-device mapping, alert job, deployment


*We do not change the existing pipeline. The web app talks only to our API and never reads InfluxDB directly. The API maps each device's MAC address to its data, reduces the ~15 samples/sec stream to a rate the browser can handle, and triggers temperature alerts.*

**Week-by-week plan**
Week	Dates	Focus	Nikhita (lead)	Shreya (frontend)	Ayush (backend/data)	Done when
1	Sep 30–Oct 2	Discovery and access	Get server, VPN and InfluxDB read token; kickoff at this Friday's meeting; pick stack; set up repo	Scaffold web app, routing, login page	Inspect buckets (AP_features, Features_V2): measurements, tags, fields, sample rate	Architecture and schema notes are written; everyone can query InfluxDB

2	Oct 5–9	Backend foundation	Build HTTPS API skeleton and auth; define endpoints	Device list and detail pages on mock data	Device registry mapping MAC address to device; queries for latest values and history with downsampling	API returns real voltage and current for one device

3	Oct 12–16	End-to-end visualization	Connect web app to API; code reviews	Live and historical charts for voltage and current; time-range picker	Aggregation windows that reduce the 15 samples/sec stream for the browser; latest-value endpoint	Mid-point demo: one device shown live in the browser

4	Oct 19–23	Temperature and alerts	Alert design (thresholds, who gets notified)	Temperature view; alert banners and settings page	Temperature threshold job and notification service (e.g. email); multi-device support	A temperature breach shows an alert and notifies the right people

5	Oct 26–30	Hardening and deployment	Security review; deploy API and web app on lab server over HTTPS	Error, empty and loading states; responsive layout; UI polish	Caching and rate limits for 100–1,000 requests/day; logging	Web app works against the deployed server; lab members test it

6	Nov 2–6	Fixes, docs, handover	Handover docs; final demo	Bug fixes; production build	API docs; setup and runbook	Final demo Fri Nov 6
Buffer	Nov 9–13	Slack and handover	Address feedback from demo	Fixes as needed	Fixes as needed	Lab signs off

*Server access in Week 1 has to happen before most other work can start. If it is delayed, the team will build against mock data and the rest of the plan will move back by the length of the delay.*

**Meetings**
Mondays, 9:00–10:00 AM ET: full team meeting, where Nikhita reports status, blockers and the week's plan
Fridays, 11:00 AM–12:00 PM ET: weekly project meeting to demo the week's work and review progress
Daily: async standup in the group chat covering what's done, what's next and any blockers
Fri Oct 16, 11 AM: mid-point demo
Fri Nov 6, 11 AM: final demo

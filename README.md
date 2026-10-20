# OpsTrack

**Time tracking and IT service management (ITSM) for engineering and support teams.**

Daily effort tracker, project time dashboards, service-desk ticketing,
email-to-ticket and workflow automation in one self-hosted web app.

The application lives in [`opstrack/`](opstrack/). See its
[README](opstrack/README.md) for features, local setup and deployment.

```bash
cd opstrack
npm install
npm start          # http://localhost:3000  (admin / admin)
```

Ways to deploy:

- **Render**: use the `render.yaml` Blueprint in this folder (Render dashboard → **New → Blueprint**).
- **Your own Ubuntu server**, with MeshCentral for remote desktop: [`opstrack/deploy`](opstrack/deploy/README.md) has a one-command installer.

# Tutorial: your first detection

In this tutorial we will run PPE Sentry locally and record our first
violation — a missing hardhat caught on a browser webcam — in about
15 minutes. No AWS, no cameras to buy, no prior knowledge of the codebase.

## What we will end with

A running dashboard at `http://localhost:8000`, one violation event with a
snapshot in the Violation Log, and one acknowledged alert. If any step does
not produce its stated result, stop — later steps build on it.

## 1. Start the backend

We need Python 3.11+ and a Supabase project with the schema applied
(see How-to: deploy prerequisites — for now, any project where you ran
`DBXSCHEMA.sql` works).

```bash
git clone https://github.com/akashpannala/X-CV && cd X-CV
cp backend/.env.exp backend/.env   # then fill the four secrets
./run.sh
```

Result: the terminal shows `Backend: http://localhost:8000`. The first run
downloads CPU torch (~300MB), so it takes a few minutes once.

## 2. Log in

Open `http://localhost:8000`. You land on the login page (the guard sends
everyone without a session there). Sign in with the user row you created
in the `users` table.

Result: the Live Compliance Monitor dashboard, feed shows OFF.

## 3. Catch a violation on the webcam

We will point the laptop webcam at ourselves *without* a hardhat on:

1. Source dropdown → **Browser Webcam** → **Start Camera**. Allow the
   browser's camera permission.
2. The overlay draws boxes within ~2 seconds (`Person`, maybe `NO-Hardhat`).
3. Wait ~30 seconds (one per-type cooldown), then open the **Violation Log**.

Result: at least one row labelled `NO-Hardhat` (or `PPE Violation`) with a
Photo button showing the annotated snapshot. The event, its boxes, and its
alert are now rows in `detection_events`, `detections`, and `alerts`.

## 4. Acknowledge it everywhere

Click **Ack** on the row. Open the **dashboard in a second tab** — its
Active Safety Violations ticker clears within a second, no refresh. That is
the cross-tab ack sync working.

Result: both tabs agree the alert is acknowledged.

## Where next

- Something failed? See How-to: cameras (source troubleshooting).
- Want this on AWS? See How-to: deploy in one command.
- Want to understand what just happened? See About the architecture.
- Exact endpoints and fields? See the API reference.

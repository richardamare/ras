# ras

ras is the owner's personal assistant: it plans work into calendars, tracks the time it takes, and reads mail and memory on the owner's behalf.

## Language

**Calendar**:
One calendar ras shows, such as a calendar of the Outlook or Google account connected to ras, or a read-only one shared into it.
_Avoid_: Space (a space has a calendar, it is not one)

**Space**:
An area work belongs to, such as personal or a client, holding its projects and tasks. Each space writes its work blocks to one calendar.
_Avoid_: Calendar, workspace

**Work block**:
A stretch of time worked or planned on one task, kept as an event in its space's calendar.
_Avoid_: Worklog, time entry

**Replica**:
The copy of the database Litestream keeps in a Cloud Storage bucket, which every start restores from and every write reaches.
_Avoid_: Backup (a backup is a full copy taken at one moment)

**Insights**:
The statistics of the time the events of the calendars the owner picks take per week, month and calendar quarter: the time already taken, and beside it the time still planned.
_Avoid_: Calendar insights, calendar stats, report, dashboard

**Backup**:
A full copy of the database, named `ras-<Prague time>.db`, in the R2 bucket. Cloud Scheduler asks for one every night through the backup route, and the owner takes one with `ras backup`.
_Avoid_: Snapshot, dump, export

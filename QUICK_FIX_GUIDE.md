# 🚀 Quick Fix Guide: "Table not found in schema cache"

## Error Message
```
Could not find the table 'public.tournament_participants' in the schema cache
```

---

## ⚡ Quick Fix (30 seconds)

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Click **"+ New query"**

### Step 2: Copy and Paste
Copy the **entire contents** of the file:
```
FIX_TOURNAMENT_PARTICIPANTS.sql
```

### Step 3: Execute
1. Paste the SQL into the editor
2. Click **"Run"** (or press `Ctrl/Cmd + Enter`)
3. Wait for completion (should take 2-5 seconds)

### Step 4: Verify Success
You should see at the bottom:
```
✅ Tournament participants table has been successfully created/updated!
✅ PostgREST schema cache has been reloaded!
✅ You can now create participants in your tournaments!
```

### Step 5: Test
1. Go back to your app
2. Navigate to a tournament's Participants tab
3. Try creating a participant
4. It should work now! 🎉

---

## 🔍 What Did This Fix?

The SQL script:
- ✅ Created the `tournament_participants` table (if missing)
- ✅ Added all required columns (`name`, `type`, `status`, `short_code`, `notes`, etc.)
- ✅ Set up proper indexes for fast queries
- ✅ Configured Row Level Security (RLS) policies
- ✅ Granted correct permissions to authenticated users
- ✅ **Reloaded the PostgREST schema cache** (this fixes the error!)

---

## 🐛 Still Not Working?

### Option 1: Manual Schema Cache Reload
Sometimes you need to wait a few seconds. Try this:

1. Open Supabase SQL Editor
2. Run this single line:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
3. Wait 10 seconds
4. Try creating a participant again

### Option 2: Verify Table Exists
Run this query in SQL Editor:
```sql
SELECT * FROM tournament_participants LIMIT 1;
```

**If you get an error**, the table doesn't exist. Re-run `FIX_TOURNAMENT_PARTICIPANTS.sql`.

**If you get results or "no rows"**, the table exists but the cache needs time. Wait 30 seconds and try again.

### Option 3: Check RLS Policies
Run this to see if you have proper access:
```sql
SELECT
    policyname,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'tournament_participants';
```

You should see at least:
- `public_read_participants` (SELECT, public)
- `authenticated_insert_participants` (INSERT, authenticated)
- `authenticated_update_participants` (UPDATE, authenticated)
- `authenticated_delete_participants` (DELETE, authenticated)

### Option 4: Check Your Auth Session
Make sure you're logged in:
1. Open DevTools (F12)
2. Go to Application > Local Storage
3. Look for `supabase.auth.token`
4. If it's missing or expired, **log out and log back in**

---

## 📊 Understanding the Error

### Why does this happen?

Supabase uses **PostgREST** to expose your database as a REST API. PostgREST keeps a **cache** of your database schema for performance.

When you:
1. Create a new table in migrations
2. But don't run them on your Supabase project
3. Or the cache gets out of sync

PostgREST doesn't know the table exists, even though it might be there!

### The Solution

The command:
```sql
NOTIFY pgrst, 'reload schema';
```

Tells PostgREST: "Hey! I changed something in the database. Please check again!"

---

## 🎯 Prevention

To avoid this in the future:

### Method 1: Use Supabase CLI (Recommended)
```bash
# Link your project (one time)
npx supabase link --project-ref YOUR_PROJECT_REF

# Apply all migrations
npx supabase db push
```

### Method 2: Manual Migration Tracking
Keep a checklist of migrations you've applied:
- ✅ `20260224100000_tournament_management_tables.sql`
- ✅ `20260306000000_enhance_tournament_participants.sql`
- ⬜ `20260307000000_your_next_migration.sql`

### Method 3: Auto-reload in Development
If working locally, Supabase auto-reloads when you apply migrations via CLI.

---

## 🆘 Emergency Rollback

If something goes wrong, you can rollback:

```sql
-- Drop the table (⚠️ DESTRUCTIVE - will lose all data)
DROP TABLE IF EXISTS public.tournament_participants CASCADE;

-- Then re-run FIX_TOURNAMENT_PARTICIPANTS.sql
```

**Before dropping**, backup your data:
```sql
-- Backup
CREATE TABLE tournament_participants_backup AS
SELECT * FROM tournament_participants;

-- Later, restore
INSERT INTO tournament_participants
SELECT * FROM tournament_participants_backup;
```

---

## 📞 Need More Help?

1. **Check the detailed guide**: [TROUBLESHOOTING_PARTICIPANTS.md](TROUBLESHOOTING_PARTICIPANTS.md)
2. **Check Supabase logs**: Dashboard > Logs > PostgREST
3. **Check browser console**: DevTools (F12) > Console tab
4. **Export your current schema**:
   ```sql
   SELECT * FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```

---

## ✅ Success Checklist

After running the fix, verify:
- [ ] No error in Supabase SQL Editor
- [ ] See success messages at the end
- [ ] Can create a participant from UI
- [ ] Participant appears in the list
- [ ] No console errors in browser DevTools
- [ ] Can edit and delete participants

**All checked?** You're done! 🎉

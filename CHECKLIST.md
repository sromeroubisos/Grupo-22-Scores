# ✅ Tournament Participants Fix Checklist

## 🎯 Goal
Fix the error: "Could not find the table 'public.tournament_participants' in the schema cache"

---

## 📋 Pre-Flight Check

- [ ] I have access to Supabase dashboard
- [ ] I know which Supabase project I'm using
- [ ] I can log into https://supabase.com/dashboard
- [ ] I have the file `EXECUTE_THIS_NOW.sql` ready

---

## 🚀 Execution Steps

### Phase 1: Access Supabase
- [ ] Opened https://supabase.com/dashboard
- [ ] Logged in successfully
- [ ] Selected the correct project
- [ ] Can see the project dashboard

### Phase 2: Open SQL Editor
- [ ] Clicked "SQL Editor" in left sidebar
- [ ] Clicked "+ New query" button
- [ ] See an empty SQL editor

### Phase 3: Execute SQL
- [ ] Opened `EXECUTE_THIS_NOW.sql` file
- [ ] Selected ALL text (Ctrl+A / Cmd+A)
- [ ] Copied the text (Ctrl+C / Cmd+C)
- [ ] Pasted into Supabase SQL Editor (Ctrl+V / Cmd+V)
- [ ] Clicked "Run" button (or pressed Ctrl+Enter)
- [ ] Saw output at the bottom

### Phase 4: Verify Success
- [ ] See message: "SUCCESS! Table created..."
- [ ] No red error messages
- [ ] Query completed successfully

### Phase 5: Wait and Test
- [ ] Waited 10 seconds (count to 10!)
- [ ] Went back to my app
- [ ] Refreshed the page (F5)
- [ ] Navigated to Tournaments → Participants tab
- [ ] Clicked "Nuevo Participante" button
- [ ] Filled out the form
- [ ] Clicked "Guardar"
- [ ] ✅ Participant was created successfully!

---

## 🔍 Verification (After Creating Participant)

### In Browser Console (F12)
- [ ] No red errors in Console tab
- [ ] See log: `[Participants API] Participant created successfully: ...`
- [ ] See the new participant in the list

### In Supabase Dashboard
- [ ] Go to Table Editor → tournament_participants
- [ ] See the newly created participant row
- [ ] All fields are populated correctly

---

## 🆘 Troubleshooting Checklist

### If Still Getting Cache Error
- [ ] Waited at least 30 seconds after running SQL
- [ ] Hard refreshed browser (Ctrl+Shift+R)
- [ ] Ran `NOTIFY pgrst, 'reload schema';` again in SQL Editor
- [ ] Checked Supabase project status: https://status.supabase.com

### If Table Not Found
- [ ] Ran this in SQL Editor:
  ```sql
  SELECT * FROM tournament_participants LIMIT 1;
  ```
- [ ] If error "relation does not exist": Re-run `EXECUTE_THIS_NOW.sql`
- [ ] If success: Table exists, just need to wait for cache

### If Permission Error
- [ ] Verified I'm logged into the app
- [ ] Checked DevTools → Application → Local Storage → supabase.auth.token exists
- [ ] Tried logging out and back in

### If Participant Saves But Doesn't Appear
- [ ] Refreshed the page
- [ ] Checked if filters are hiding it
- [ ] Ran this in SQL Editor:
  ```sql
  SELECT * FROM tournament_participants ORDER BY created_at DESC LIMIT 5;
  ```

---

## 📊 Success Metrics

### You'll know it's fixed when:
✅ No console errors when creating participant
✅ Participant appears immediately in the list
✅ Can edit the participant
✅ Can delete the participant
✅ Can create multiple participants
✅ Search/filter works correctly

---

## 🎉 Post-Fix Actions

Once everything works:

### Required
- [ ] Test creating a club-linked participant
- [ ] Test creating a manual participant
- [ ] Test editing a participant
- [ ] Test deleting a participant

### Optional
- [ ] Document this fix in team wiki
- [ ] Share with teammates
- [ ] Delete the temporary SQL/README files
- [ ] Set up automated migrations (see README_PARTICIPANT_FIX.md)

---

## 📝 Notes Section

Use this space to track what happened:

**Date:** _______________

**What I did:**


**Results:**


**Time taken:**


**Issues encountered:**


**How I resolved them:**


---

## 🔗 Quick Reference

- **Main Fix SQL**: `EXECUTE_THIS_NOW.sql`
- **Step-by-step Guide**: `FIX_STEPS.md`
- **Troubleshooting**: `TROUBLESHOOTING_PARTICIPANTS.md`
- **Overview**: `README_PARTICIPANT_FIX.md`

---

**Print this checklist and check off items as you go! ✍️**

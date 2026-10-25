# Start your portfolio

[Open in Codespaces](https://codespaces.new/arizonal2014/MIT8103_Portfolio_Generator). Wait for setup and open **Ports → 4310 → Open in Browser**. Keep the port **Private**.

Connect GitHub once when prompted. The app opens GitHub's device sign-in page so you can approve creation of your private assessment repository. Copilot uses your own account and allowance.

1. **Details:** enter first name, surname, student ID and case study. Choose **Create portfolio**.
2. **Build:** watch each stage complete. Expand a row for its log and commit link. Use **Retry remaining stages** if needed.
3. **Repository:** choose **Open my portfolio**. The five folders, evidence and final summary are already saved in your private `Surname_Firstname_StudentID` repository.

Review the case-specific reflection and edit the final summary on GitHub to reflect your own understanding. Review the scripts and results. Update the PDF after your edits, confirm assessor access and follow the assessment submission instructions.

Before generation, the app checks your case wording, repository name and available database tools. Common typos get a suggestion; a vague title asks for a subject. You can enter your own case study.

If the repository already exists, use **Open existing repository** or **Return to saved run**. Keep your real name and student ID. If generation fails, follow the short message and use **Retry remaining stages**. Earlier completed stages and commits stay saved. If the initial design fails, **Edit case study** lets you clarify it and retry in the same repository. The case stays fixed once Portfolio 1 is complete. If your original Codespace was deleted, your GitHub files remain available; the app cannot resume database stages without that workspace's saved run.

Reloading reconnects to your saved run. It does not start a duplicate AI request. A retry preserves completed stages and commits. Existing work with the same repository name is left untouched.

To restart the app, run `npm run workspace`. Stop the Codespace when finished.

## Continue after a Copilot access error

1. Open [Copilot settings](https://github.com/settings/copilot) in the same GitHub account connected to the generator. Check your Copilot plan and CLI access. If an organisation manages access, ask its administrator to enable it. Reconnecting GitHub alone does not remove a policy restriction.
2. In the terminal of your **original generator Codespace**, update the generator:

   ```bash
   git pull --ff-only
   ```

   If Git reports local changes or a merge problem, keep your files and ask for help. Do not reset the repository. A personal copy needs the fix from the [generator repository](https://github.com/arizonal2014/MIT8103_Portfolio_Generator), rather than pulling an unchanged copy.
3. Stop that Codespace, then reopen the **same Codespace** from [Your Codespaces](https://github.com/codespaces). This restarts the app with the updated code. Open **Ports → 4310 → Open in Browser** again.
4. Your paused run should reappear with corrected guidance. Once Copilot access is enabled, select **Retry remaining stages**. If the form appears, enter the same details and choose **Return to saved run**.

The existing repository, completed stages and commits are retained. Keep `runs/` and `.workspace-state/` in the original Codespace. The update corrects the message and recovery controls; it does not grant Copilot access or remove an organisation policy.

## PostgreSQL connection closed during startup

The startup fix waits for PostgreSQL to finish initialising before creating the database. If your failed run showed `Docker command exited 2` and its log shows `CREATE ROLE` followed by an administrator-shutdown message, update the original generator Codespace with `git pull --ff-only`. Stop and reopen that same Codespace, open port 4310, then choose **Retry remaining stages**. Keep your existing repository and run files. Copilot settings do not resolve this database startup error.

# Post-Traumatic

A mod to make Traumasoft mobile-friendly. Works with Safari on iPhone or Firefox on Android. Post-Traumatic puts the most-used options directly in the top bar and restructures the schedule, work order, checklist, and punch clock pages for dramatically increased usability. It also lets the log-in page remember your username after the first time it's typed. The rest of the site is unchanged.

Talk to Julian Eden on Blink if you encounter any issues.

## iPhone (Safari)

1. Install the free **Userscripts** app from the App Store and open it once so it can initialize. You can close it right after.
2. In the Settings app go to **Apps → Safari → Extensions → Userscripts**. Turn it on and set **All Websites** to **Allow**. If Safari asks later, choose **Always Allow**, not one day.
3. In Safari, open https://tinyurl.com/post-traumatic. Tap **aA** in the address bar, tap **Userscripts**, then **Install**.

To update Post-Traumatic later in case of a new version, repeat step 3.

(*Optional, for faster access*) To get a home screen icon that opens the schedule: open the **Shortcuts** app, tap **+**, search for the **Open URLs** action and select it, tap the URL field on the new action and enter `x-safari-https://armstrong.traumasoft.com/main.php?a=user:schedule`, then tap the little down arrow next to the shortcut's name at the top to open the dropdown menu and choose **Add to Home Screen**. It will let you pick a name for the shortcut icon.


## Android (Firefox)

1. In Firefox, open https://addons.mozilla.org/firefox/addon/post-traumatic/
2. Tap **Add to Firefox**, then **Add**.

(*Optional, for faster access*) To create an icon that directly opens the page, open the schedule in Firefox. Tap the 3-dots in the top right corner. Tap More. Tap `Add to Home Screen`.

Updates are automatic.


Shareable copy of these instructions: https://tinyurl.com/post-traumatic-install-guide

Full list of changes: [CHANGES.md](CHANGES.md). Build, test and release notes: [DEVELOPMENT.md](DEVELOPMENT.md).

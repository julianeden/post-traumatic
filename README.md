# Post-Traumatic

A mod to make Traumasoft mobile-friendly. Works with Safari on iPhone or Firefox on Android. Post-Traumatic puts the most-used options directly in the top bar and restructures the schedule, work order, checklist, and punch clock pages for dramatically increased usability. It also lets the log-in page remember your username after the first time it's typed. The rest of the site is unchanged.

## iPhone (Safari)

1. Install the free **Userscripts** app from the App Store.
2. Go to **Settings → Safari → Extensions → Userscripts**. Turn it on and allow it on `traumasoft.com`.
3. In Safari, open https://tinyurl.com/post-traumatic, tap the Extensions icon in the address bar, tap **Userscripts**, then **Install**.
4. (*Optional, for faster access*) To get a home screen icon that opens the schedule: open the **Shortcuts** app, tap **+**, tap **Add Action**, search for **Open URLs** and pick it, tap the URL field and enter `https://armstrong.traumasoft.com/main.php?a=user:schedule`, then tap the **ⓘ** at the bottom and choose **Add to Home Screen**. (Safari's own Add to Home Screen doesn't work here: icons made that way open the site without the mod.)

To update later, repeat step 3.

## Android (Firefox)

1. In Firefox, open https://addons.mozilla.org/firefox/addon/post-traumatic/
2. Tap **Add to Firefox**, then **Add**. Updates are automatic.
3. (*Optional, for faster access*) To create an icon that directly opens the page, open the schedule in Firefox. Tap the 3-dots in the top right corner. Tap More. Tap `Add to Home Screen`.

Talk to Julian Eden on Blink if you encounter any issues.

Full list of changes: [CHANGES.md](CHANGES.md). Build, test and release notes: [DEVELOPMENT.md](DEVELOPMENT.md).

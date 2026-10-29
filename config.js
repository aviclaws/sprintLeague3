/* Shared settings for the coach page (coach.html) and the viewer page (index.html).
 *
 * topic    - the "mailbox" on ntfy.sh that live results are posted to. Anyone who
 *            knows it can read (and technically write) it, so keep it unguessable.
 *            Change it to any 8-60 letters/digits/-/_ to start a fresh feed.
 * passcode - asked once on each device before coach.html opens. This only keeps
 *            casual visitors out of the coach controls; it is NOT real security.
 */
window.SL_CONFIG = {
  topic: "sl3-7ovy0nbjd0q204",
  passcode: "sprint"
};

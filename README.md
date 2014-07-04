-----
#### Introduction


ComicStreamer is a media server app for sharing a library of comic files via a simple REST API to client applications.
It allows for searching for comics based on a rich set of metadata including fields like series name, title, publisher,
story arcs, characters, and creator credits.  Client applications may access comics by entire archive file, or by fetching pag
e images, one at a time.

A web interface is available for searching and viewing comics files, and also for configuration, log viewing, and some control
operations.

It's best used on libraries that have been tagged internally with tools like [ComicTagger](http://code.google.com/p/comictagger/) or
[ComicRack](http://comicrack.cyolito.com/). However, even without tags, it will try to parse out some information from the filename
(usually series, issue number, and publication year).

ComicStreamer is very early ALPHA stages, and may be very flakey, eating up memory and CPU cycles. In particular, with very large datasets,
filters on the sub-lists (characters, credits, etc. ) can be slow.

If you have web development or graphic design skills, and would like to help out, please contact me at comictagger@gmail.com.
In particular, ComicStreamer needs a new logo!

[Chunky Comic Reader](http://chunkyreader.com/) for iPad has added experimental ComicStreamer support. Pro upgrade required, but it's well
worth it for the other features you get.  Check it out!  If you are comic reader developer (any platform), and would like to add CS support,
please contact me if you need any special support or features.

----------

#### Compiled Package Downloads

**[Windows and Mac OS X](https://googledrive.com/host/0Bw4IursaqWhhbDFzUENfSTAwckE/)**

----------

#### Requirements (for running from source) 

* python 2.7

(via pip):

* tornado
* sqlalchemy >= 0.9
* watchdog
* python-dateutil
* pillow (PIL fork)
* configobj >= 5.0.5
* natsort

Optional:

* pybonjour (for automatic server discovery)


------
#### Installation

For source, just unzip somewhere.  For the binary packages, it's the usual drill for that platform.
(No setup.py yet, sorry)

Settings, database, and logs are kept in the user folder:

* On Linux: "~/.ComicStreamer"
* On Mac OS: "~/Library/Application Support/ComicStreamer"
* On Windows:  "%APPDATA%\ComicStreamer"

----------
#### Running

From the source, just run "comicstreamer" in the base folder (on windows you may want to rename it comicstreamer.py).

For the binary builds, run from the installed app icon.  There should be no taskbar/dock presence, but an icon should appear in the system tray
(windows), or status menu (mac).

A web browser should automatically open to "http://localhost:32500".  On your first run, use the "config" page to set the comic folders, and
the "control" page to restart the server.  It will start scanning, and all comics in the given folders and sub folders will be added to database.

Some tips:

* Use "--help" option to list command-line options
* Use the "--reset" option (CLI) or control page "Rebuild Database" to wipe the database if you're having problems.


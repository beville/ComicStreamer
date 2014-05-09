-----
#### Introduction


ComicStreamer is a media server app for sharing a library of comic files via a simple REST API to client applications.  It allows for searching for comics based on a rich set of metadata including fields like series name, title, publisher, story arcs, characters, and creator credits.

A web interface is also available for searching and viewing comics files.

It's best used on libraries that have been tagged internally with tools like [ComicTagger](http://code.google.com/p/comictagger/) or [ComicRack](http://comicrack.cyolito.com/). However, even without tags, it will try to parse out some information from the filename (usually series, issue number, and publication year).

ComicStreamer is very early ALPHA stages, and may be very flakey, eating up memory and CPU cycles. In particular, with very large datasets, filters on the sub-lists (characters, credits, etc. ) can be slow.

----------

#### Requirements 

* python 2.7

(via pip):

* tornado
* sqlalchemy >= 0.9
* watchdog
* python-dateutil
* pillow (PIL fork)
* configobj >= 5.0.5


------
#### Installation

Just unzip somewhere. 

(Eventually, there will be native build packages for Mac OS and Windows, as well as setup.py)

Settings, database, and logs are kept in the user folder:

* On Linux: "~/.ComicStreamer"
* On Mac OS: "~/Library/Application Support/ComicStreamer"
* On Windows:  "%APPDATA%\ComicStreamer"

----------
#### Running

Just run "comicstreamer" in the base folder (on windows you may want to rename it comicstreamer.py)

A web browser should automatically open to "http://localhost:32500"

Some tips:

* Use "--help" option to list command-line options
* Use the "config" page to set the comic folders, and the "control" page to restart the server
* Use the "--reset" option to wipe the database

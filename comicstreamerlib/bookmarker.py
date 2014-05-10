# coding=utf-8

"""
ComicStreamer bookmark manager thread class
"""

"""
Copyright 2012-2014  Anthony Beville

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import threading
import select
import sys
import logging
import platform
import Queue
import datetime

from database import Comic

class Bookmarker(threading.Thread):
    def __init__(self, dm):
        super(Bookmarker, self).__init__()

        self.queue = Queue.Queue(0)
        self.quit = False
        self.dm = dm
        
    def stop(self):
        self.quit = True
        self.join()
        
    def setBookmark(self, comic_id, pagenum):
        self.queue.put((comic_id, pagenum))
        
    def run(self):
        logging.debug("Bookmarker: started main loop.")
        self.session = self.dm.Session()
        
        while True:
            try:
                (comic_id, pagenum) = self.queue.get(block=True, timeout=1)
            except:
                comic_id = None
                
            if comic_id is not None:
                obj = self.session.query(Comic).filter(Comic.id == int(comic_id)).first()
                if obj is not None:
                    if int(pagenum) < obj.page_count:
                        obj.lastread_ts = datetime.datetime.utcnow()
                        obj.lastread_page = int(pagenum)
                        self.session.commit()
                        
            if self.quit:
                break
            
        self.session.close()
        self.session = None
        logging.debug("Bookmarker: stopped main loop.")

#-------------------------------------------------


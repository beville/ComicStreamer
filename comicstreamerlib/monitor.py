#!/usr/bin/env python

import sys
import os
import hashlib
import md5
import mmap
import datetime
import time
import threading
import Queue
import logging
from watchdog.observers import Observer
from watchdog.events import LoggingEventHandler
import watchdog

from libs.comictaggerlib.comicarchive import *
from libs.comictaggerlib.issuestring import *
import utils

from database import *

class  MonitorEventHandler(watchdog.events.FileSystemEventHandler):
    
    def __init__(self, monitor):
        self.monitor = monitor
        self.ignore_directories = True
        
    def on_any_event(self,event):
        if event.is_directory:
            return
        self.monitor.handleSingleEvent(event)


class Monitor():
        
    def __init__(self, dm, paths):
        
        self.dm = dm
        self.style = MetaDataStyle.CIX
        self.queue = Queue.Queue(0)
        self.paths = paths
        self.eventList = []
        self.mutex = threading.Lock()
        self.eventProcessingTimer = None
        self.quit_when_done = False  # for debugging/testing
        self.status = "IDLE"
        self.statusdetail = ""
        self.scancomplete_ts = ""

    def start(self):
        self.thread = threading.Thread(target=self.mainLoop)
        self.thread.daemon = True
        self.quit = False
        self.thread.start()     

    def stop(self):
        self.quit = True
        self.thread.join()

    def mainLoop(self):

        logging.debug("Monitor: started main loop.")
        self.session = self.dm.Session()
        
        observer = Observer()
        self.eventHandler = MonitorEventHandler(self)
        for path in self.paths:
            if os.path.exists(path):
                observer.schedule(self.eventHandler, path, recursive=True)
        observer.start()
        
        while True:
            try:
                (msg, args) = self.queue.get(block=True, timeout=1)
            except:
                msg = None
                
            #dispatch messages
            if msg == "scan":
                self.dofullScan(self.paths)

            if msg == "events":
                self.doEventProcessing(args)
            
            #time.sleep(1)
            if self.quit:
                break
            
        self.session.close()
        self.session = None
        observer.stop()
        logging.debug("Monitor: stopped main loop.")
        
    def scan(self):
        self.queue.put(("scan", None))
    
    def handleSingleEvent(self, event):
        # events may happen in clumps.  start a timer
        # to defer processing.  if the timer is already going,
        # it will be canceled
        
        # in the future there can be more smarts about
        # granular file events.  for now this will be
        # good enough to just get a a trigger that *something*
        # changed
        
        self.mutex.acquire()
        
        if self.eventProcessingTimer is not None:
            self.eventProcessingTimer.cancel()
        self.eventProcessingTimer = threading.Timer(30, self.handleEventProcessing)
        self.eventProcessingTimer.start()
        
        self.mutex.release()
        

    
    def handleEventProcessing(self):
        
        # trigger a full rescan
        self.mutex.acquire()
        
        self.scan()
        
        # remove the timer
        if self.eventProcessingTimer is not None:
            self.eventProcessingTimer = None
            
        self.mutex.release()


    def checkIfRemovedOrModified(self, comic, pathlist):
        remove = False
        
        def inFolderlist(filepath, pathlist):
            for p in pathlist:
                if p in filepath:
                    return True
            return False
        
        if not (os.path.exists(comic.path)):
            # file is missing, remove it from the comic table, add it to deleted table
            logging.debug(u"Removing missing {0}".format(comic.path))
            remove = True
        elif not inFolderlist(comic.path, pathlist):
            logging.debug(u"Removing unwanted {0}".format(comic.path))
            remove = True
        else:
            # file exists.  check the mod date.
            # if it's been modified, remove it, and it'll be re-added
            #curr = datetime.datetime.fromtimestamp(os.path.getmtime(comic.path))
            curr = datetime.utcfromtimestamp(os.path.getmtime(comic.path))
            prev = comic.mod_ts
            if curr != prev:
                logging.debug(u"Removed modifed {0}".format(comic.path))
                remove = True
           
        if remove:
            self.removeComic(comic)
            self.remove_count += 1

    def getComicMetadata(self, path):
        
        #print time.time() - start_time, "seconds"

        ca = ComicArchive(path,  default_image_path=AppFolders.imagePath("default.jpg"))
        
        if ca.seemsToBeAComicArchive():
            #print >>  sys.stdout, u"Adding {0}...     \r".format(count),
            logging.debug(u"Reading in {0} {1}\r".format(self.read_count, path))
            sys.stdout.flush()
            self.read_count += 1

            if ca.hasMetadata( MetaDataStyle.CIX ):
                style = MetaDataStyle.CIX
            elif ca.hasMetadata( MetaDataStyle.CBI ):
                style = MetaDataStyle.CBI
            else:
                style = None
                
            if style is not None:
                md = ca.readMetadata(style)
            else:
                # No metadata in comic.  make some guesses from the filename
                md = ca.metadataFromFilename()
                
            md.path = ca.path 
            md.page_count = ca.page_count
            md.mod_ts = datetime.utcfromtimestamp(os.path.getmtime(ca.path))
            md.filesize = os.path.getsize(md.path)
            md.hash = ""
            
            #logging.debug("before hash")
            #md5 = hashlib.md5()
            #md5.update(open(md.path, 'r').read())
            #md.hash = unicode(md5.hexdigest())
            #logging.debug("after hash")
            
            return md
        return None
                
                
        
    def removeComic(self, comic):
        deleted = DeletedComic()
        deleted.comic_id = comic.id
        self.session.add(deleted)
        self.session.delete(comic)

    def fetchObjByName(self, obj_dict, instance_name,):
        try:
            #logging.debug( u"FETCH:= {0} {1} {2}".format(obj.name, obj.id, type(obj)))
            obj = None
            obj = obj_dict[instance_name]
        except Exception as e:
            print "-------->", e, instance_name
        return obj

    def addComicFromMetadata(self, md ):
        #logging.debug(u"Adding {0} {1}\r".format(self.add_count, md.path))
        #sys.stdout.flush()
    
        self.add_count += 1
        
        comic = Comic()
        # store full path, and filename and folder separately, for search efficiency,
        # at the cost of redundant storage
        comic.folder, comic.file = os.path.split(md.path)
        comic.path = md.path

        comic.page_count = md.page_count
        comic.mod_ts = md.mod_ts
        comic.hash = md.hash
        comic.filesize = md.filesize
        
        if not md.isEmpty:
            if md.series is not None:
                comic.series   = unicode(md.series)
            if md.issue is not None:
                comic.issue = unicode(md.issue)
                comic.issue_num = IssueString(unicode(comic.issue)).asFloat()   
     
            if md.year is not None:
                try:
                    day = 1   
                    month = 1 
                    if md.month is not None:
                        month = int(md.month)
                    if md.day is not None:
                        day = int(md.day)
                    year = int(md.year)
                    comic.date = datetime(year,month,day)
                except:
                    pass
                
            comic.year = md.year
            comic.month = md.month
            comic.day = md.day
            
            if md.volume is not None:
                comic.volume = int(md.volume)
            if md.publisher is not None:
                comic.publisher = unicode(md.publisher)
            if md.title is not None:
                comic.title = unicode(md.title)
            if md.comments is not None:
                comic.comments = unicode(md.comments)
            if md.imprint is not None:
                comic.imprint = unicode(md.imprint)
            if md.webLink is not None:
                comic.weblink = unicode(md.webLink)
                    

        self.session.add(comic)
        
        if md.characters is not None:
            for c in list(set(md.characters.split(","))):
                character = self.fetchObjByName( self.character_dict, c.strip())
                comic.characters_raw.append(character)
                #comic.characters_raw.append(self.character_objs[0])
                
        if md.teams is not None:
            for t in list(set(md.teams.split(","))):
                team = self.fetchObjByName( self.team_dict, t.strip())
                comic.teams_raw.append(team)
        if md.locations is not None:
            for l in list(set(md.locations.split(","))):
                location = self.fetchObjByName( self.location_dict, l.strip())
                comic.locations_raw.append(location)            
        if md.storyArc is not None:
            for sa in list(set(md.storyArc.split(","))):
                storyarc = self.fetchObjByName( self.storyarc_dict,  sa.strip())                     
                comic.storyarcs_raw.append(storyarc)
                pass
        if md.genre is not None:
            for g in list(set(md.genre.split(","))):
                genre = self.fetchObjByName( self.genre_dict,  g.strip())                     
                comic.genres_raw.append(genre)
                pass            
        if md.tags is not None:
            for gt in list(set(md.tags)):
                generictag = self.fetchObjByName( self.generictag_dict,  gt.strip())                     
                comic.generictags_raw.append(generictag)
                pass
        
        if md.credits is not None:
            for credit in md.credits:
                role = self.fetchObjByName( self.role_dict,  credit['role'].lower().strip())                     
                person = self.fetchObjByName( self.person_dict,  credit['person'].strip())                       
                comic.credits_raw.append(Credit(person, role))
                #comic.credits_raw.append(Credit(self.person_objs[0], self.role_objs[0]))
                pass
    
    def buildChildSets(self, md):       
        if md.characters is not None:
            for n in list(set(md.characters.split(","))):
                self.character_names.add(n.strip())
        if md.teams is not None:
            for n in list(set(md.teams.split(","))):
                self.team_names.add(n.strip())
        if md.locations is not None:
            for n in list(set(md.locations.split(","))):
                self.location_names.add(n.strip())
        if md.storyArc is not None:
            for n in list(set(md.storyArc.split(","))):
                self.storyarc_names.add(n.strip())
        if md.genre is not None:
            for n in list(set(md.genre.split(","))):
                self.genre_names.add(n.strip())                
        if md.tags is not None:
            for n in list(set(md.tags)):
                self.generictag_names.add(n.strip())        
        if md.credits is not None:
            for credit in md.credits:
                self.person_names.add(credit['person'].strip())
                self.role_names.add(credit['role'].lower().strip())
     
     
    def saveChildInfoToDB(self, md_list):
    
        character_names = set()
        team_names = set()
        location_names = set()
        storyarc_names = set()
        genre_names = set()
        person_names = set()
        role_names = set()
        generictag_names = set()
                
        for md in md_list:
            if md.characters is not None:
                for n in list(set(md.characters.split(","))):
                    character_names.add(n.strip())
            if md.teams is not None:
                for n in list(set(md.teams.split(","))):
                    team_names.add(n.strip())
            if md.locations is not None:
                for n in list(set(md.locations.split(","))):
                    location_names.add(n.strip())
            if md.storyArc is not None:
                for n in list(set(md.storyArc.split(","))):
                    storyarc_names.add(n.strip())
            if md.genre is not None:
                for n in list(set(md.genre.split(","))):
                    genre_names.add(n.strip())
            if md.tags is not None:
                for n in list(set(md.tags)):
                    generictag_names.add(n.strip())        
            if md.credits is not None:
                for credit in md.credits:
                    person_names.add(credit['person'].strip())
                    role_names.add(credit['role'].lower().strip())
        
        def addNamedObjects(cls, nameset):
            q = self.session.query(cls.name)
            existing_set = set([i[0] for i in list(q)])
            nameset = nameset - existing_set
            #logging.debug( "new {0} size = {1}".format( cls, len(nameset )))
            for n in nameset:
                obj = cls(name=n)
                #print cls, n
                self.session.add(obj)

        # For each set, get the existing set of names in the DB,
        # and get the difference set.  With the set of only new names,
        # insert them all
     
        addNamedObjects(Character, character_names)
        addNamedObjects(Team, team_names)
        addNamedObjects(Location, location_names)
        addNamedObjects(StoryArc, storyarc_names)
        addNamedObjects(Genre, genre_names)
        addNamedObjects(Person, person_names)
        addNamedObjects(Role, role_names)
        addNamedObjects(GenericTag, generictag_names)
        
        self.session.commit()
        
        
     
    def createChildDicts(self):
    
        # read back all theose objects with their keys
        character_objs = self.session.query(Character).all()
        team_objs = self.session.query(Team).all()
        location_objs = self.session.query(Location).all()
        storyarc_objs = self.session.query(StoryArc).all()
        genre_objs = self.session.query(Genre).all()
        person_objs = self.session.query(Person).all()
        role_objs = self.session.query(Role).all()
        generictag_objs = self.session.query(GenericTag).all()
 
        def buildDict(obj_list, objdict):    
           for o in obj_list:
               objdict[o.name] = o
                
        self.character_dict = dict()
        self.team_dict = dict()
        self.location_dict = dict()
        self.storyarc_dict = dict()
        self.genre_dict = dict()
        self.person_dict = dict()
        self.role_dict = dict()
        self.generictag_dict = dict()     
        
        buildDict(character_objs, self.character_dict)
        buildDict(team_objs, self.team_dict)
        buildDict(location_objs, self.location_dict)
        buildDict(storyarc_objs, self.storyarc_dict)
        buildDict(genre_objs, self.genre_dict)
        buildDict(person_objs, self.person_dict)
        buildDict(role_objs, self.role_dict)
        buildDict(generictag_objs, self.generictag_dict)

    def setStatusDetail(self, detail, level=logging.DEBUG):
        self.statusdetail = detail
        if level == logging.DEBUG:
            logging.debug(detail)
        else:
            logging.info(detail)

    def setStatusDetailOnly(self, detail):
        self.statusdetail = detail
            
    def commitMetadataList(self, md_list):
        # now that we have a chunk of  metadata is read in, make up lists of all the "named" entities to
        # add to the DB before the actual comics are added
        #self.setStatusDetailOnly(u"Monitor: Adding {0} files to library...".format(len(md_list)))

        self.saveChildInfoToDB(md_list)

        #logging.debug(u"Monitor: finish adding child sets")

        # create dictionarys of all those objects, so we don't have to query the database 
        self.createChildDicts()
        
        for md  in md_list:
            self.addComicFromMetadata( md )
            if self.quit:
                self.setStatusDetail(u"Monitor: halting scan!")
                return
                
            # periodically commit   
            #if self.add_count % 1000 == 0:
            #    self.session.commit()
            #    self.setStatusDetail(u"Monitor: {0} of {1} added...".format(self.add_count,len(md_list)), logging.INFO)
                
        if self.add_count > 0:  
            self.session.commit()
                    
    def dofullScan(self, dirs):
        
        self.status = "SCANNING"
        
        logging.info(u"Monitor: Beginning file scan...")
        self.setStatusDetail(u"Monitor: Making a list of all files in the folders...")

        filelist = utils.get_recursive_filelist( dirs )
        self.setStatusDetail(u"Monitor: sorting recursive file list ({0} items)".format(len(filelist)))
        filelist = sorted(filelist, key=os.path.getmtime)
        
        self.setStatusDetail(u"Monitor: done listing files.")
        
        self.add_count = 0      
        self.remove_count = 0
        
        # get the entire comic table into memory
        query = list(self.session.query(Comic))
        
        # look for missing or changed files 
        self.setStatusDetail(u"Monitor: Removing missing or modified files from DB...")
        #start_time = time.time()
        for comic in query:
            self.checkIfRemovedOrModified( comic, self.paths )
            if self.quit:
                self.setStatusDetail(u"Monitor: halting scan!")
                return
                
        #print time.time() - start_time, "seconds"
        self.setStatusDetail(u"Monitor: Done removing files.")
        
        if self.remove_count > 0:
            self.dm.engine.echo = True
            self.session.commit()
            self.dm.engine.echo = False

        self.setStatusDetail(u"Monitor: found {0} files to inspect...".format(len(filelist)))
        
        # make a list of all path strings in comic table
        db_pathlist = [i[0] for i in list(self.session.query(Comic.path))]
        
        self.setStatusDetail(u"Monitor: removing already scanned files from file list")
        for f in db_pathlist:
            if f in filelist:
                filelist.remove(f)
        db_pathlist = None

        self.setStatusDetail(u"Monitor: {0} new files to scan...".format(len(filelist)), logging.INFO)

        md_list = []
        self.read_count = 0
        for filename in filelist:
            md = self.getComicMetadata( filename )
            if md is not None:
                md_list.append(md)
            self.setStatusDetailOnly(u"Monitor: {0} files: {1} scanned, {2} added to library...".format(len(filelist), self.read_count,self.add_count))
            if self.quit:
                self.setStatusDetail(u"Monitor: halting scan!")
                return
            
            #every so often, commit to DB
            if self.read_count % 100 == 0 and self.read_count != 0:
                if len(md_list) > 0:
                    self.commitMetadataList(md_list)
                    md_list = []
        
        if len(md_list) > 0:
            self.commitMetadataList(md_list)
        
        self.setStatusDetail(u"Monitor: finished scanning metadata in {0} of {1} files".format(self.read_count,len(filelist)), logging.INFO)

 
        
        self.status = "IDLE"
        self.statusdetail = ""
        self.scancomplete_ts = int(time.mktime(datetime.utcnow().timetuple()) * 1000)
        
        logging.info("Monitor: Added {0} comics".format(self.add_count))
        logging.info("Monitor: Removed {0} comics".format(self.remove_count))
        
        if self.remove_count > 0 or self.add_count > 0:
            self.session.query(DatabaseInfo).first().last_updated = datetime.utcnow()
            self.session.commit()
            
        if self.quit_when_done:
            self.quit = True

    def doEventProcessing(self, eventList):
        logging.debug(u"Monitor: event_list:{0}".format(eventList))

        
if __name__ == '__main__':
    
    if len(sys.argv) < 2:
        print >> sys.stderr, "usage:  {0} comic_folder ".format(sys.argv[0])
        sys.exit(-1)    

    
    utils.fix_output_encoding()
    
    dm = DataManager()
    dm.create()
    m = Monitor(dm, sys.argv[1:])
    m.quit_when_done = True
    m.start()
    m.scan()

    #while True:
    #   time.sleep(10)

    m.stop()

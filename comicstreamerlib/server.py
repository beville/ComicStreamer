#!/usr/bin/env python

from datetime import date
import tornado.escape
import tornado.ioloop
import tornado.web

from sqlalchemy import desc
from sqlalchemy.orm import joinedload,subqueryload,aliased
from  sqlalchemy.sql.expression import func, select

import json
import pprint
import mimetypes
import Image
import StringIO
import gzip
import dateutil.parser
import logging
import logging.handlers
import imghdr
import random
import signal
import sys
import socket

from comictaggerlib.comicarchive import *

import csversion
import utils
from database import *
from monitor import Monitor
from config import ComicStreamerConfig
from options import Options



class BaseHandler(tornado.web.RequestHandler):
    pass
    
class GenericAPIHandler(BaseHandler):
    pass

class JSONResultAPIHandler(BaseHandler):
    def setContentType(self):
        self.add_header("Content-type","application/json; charset=UTF-8")

    def processPagingArgs(self, query):
        per_page = self.get_argument(u"per_page", default=None)
        offset = self.get_argument(u"offset", default=None)
        # offset and max_results should be processed last
        
        total_results = None
        if per_page is not None:
            total_results = query.count()
            try:
                max = 0
                max = int(per_page)
                if total_results > max:
                    query = query.limit(max)
            except:
                pass            

        if offset is not None:
            try:
                off = 0
                off = int(offset)
                query = query.offset(off)
            except:
                pass
                
        return query, total_results

        
    def processComicQueryArgs(self, query):
        def hasValue(obj):
            return obj is not None and obj != ""
        
        keyphrase_filter = self.get_argument(u"keyphrase", default=None)
        series_filter = self.get_argument(u"series", default=None)
        filename_filter = self.get_argument(u"path", default=None)
        title_filter = self.get_argument(u"title", default=None)
        start_filter = self.get_argument(u"start_date", default=None)
        end_filter = self.get_argument(u"end_date", default=None)
        added_since = self.get_argument(u"added_since", default=None)
        modified_since = self.get_argument(u"modified_since", default=None)
        lastread_since = self.get_argument(u"lastread_since", default=None)
        order = self.get_argument(u"order", default=None)
        character = self.get_argument(u"character", default=None)
        team = self.get_argument(u"team", default=None)
        location = self.get_argument(u"location", default=None)
        storyarc = self.get_argument(u"storyarc", default=None)
        volume = self.get_argument(u"volume", default=None)
        publisher = self.get_argument(u"publisher", default=None)
        credit_filter = self.get_argument(u"credit", default=None)
        tag = self.get_argument(u"tag", default=None)
        
        person = None
        role = None
        if hasValue(credit_filter):
            credit_info = credit_filter.split(":")
            if len(credit_info[0]) != 0:
                person = credit_info[0] 
                if len(credit_info) > 1:
                    role = credit_info[1]

        if hasValue(person):
            query = query.join(Credit).filter(Person.name.ilike(person.replace("*","%"))).filter(Credit.person_id==Person.id)
            if role is not None:
                query = query.filter(Credit.role_id==Role.id).filter(Role.name.ilike(role.replace("*","%")))
            #query = query.filter( Comic.persons.contains(unicode(person).replace("*","%") ))
        
        if hasValue(keyphrase_filter):
            keyphrase_filter = unicode(keyphrase_filter).replace("*","%")
            keyphrase_filter = "%" + keyphrase_filter + "%"
            query = query.filter( Comic.series.ilike(keyphrase_filter) 
                                | Comic.title.ilike(keyphrase_filter)
                                | Comic.publisher.ilike(keyphrase_filter)
                                | Comic.path.ilike(keyphrase_filter)
                                | Comic.comments.ilike(keyphrase_filter)
                                #| Comic.characters.contains(keyphrase_filter)
                                #| Comic.teams.contains(keyphrase_filter)
                                #| Comic.locations.contains(keyphrase_filter)
                                #| Comic.storyarcs.contains(keyphrase_filter)
                                #| Comic.persons.contains(keyphrase_filter)
                            )

        if hasValue(series_filter):
            query = query.filter( Comic.series.ilike(unicode(series_filter).replace("*","%") ))
        if hasValue(title_filter):
            query = query.filter( Comic.title.ilike(unicode(title_filter).replace("*","%") ))
        if hasValue(filename_filter):
            query = query.filter( Comic.path.ilike(unicode(filename_filter).replace("*","%") ))
        if hasValue(publisher):
            query = query.filter( Comic.publisher.ilike(unicode(publisher).replace("*","%") ))
        if hasValue(character):
            query = query.filter( Comic.characters.contains(unicode(character).replace("*","%") ))
        if hasValue(tag):
            query = query.filter( Comic.generictags.contains(unicode(tag).replace("*","%") ))
        if hasValue(team):
            query = query.filter( Comic.teams.contains(unicode(team).replace("*","%") ))
        if hasValue(location):
            query = query.filter( Comic.locations.contains(unicode(location).replace("*","%") ))
        if hasValue(storyarc):
            query = query.filter( Comic.storyarcs.contains(unicode(storyarc).replace("*","%") ))
        if hasValue(volume):
            try:
                vol = 0
                vol = int(volume)
                query = query.filter(Comic.volume == vol)
            except:
                pass
                    
        if hasValue(start_filter):
            try:
                dt = dateutil.parser.parse(start_filter)
                query = query.filter( Comic.date >= dt)
            except:
                pass
        
        if hasValue(end_filter):
            try:
                dt = dateutil.parser.parse(end_filter)
                query = query.filter( Comic.date <= dt)
            except:
                pass
            
        if hasValue(modified_since):
            try:
                dt=dateutil.parser.parse(modified_since)
                resultset = resultset.filter( Comic.mod_ts >= dt )
            except:
                pass

        if hasValue(added_since):
            try:
                dt=dateutil.parser.parse(added_since)
                query = query.filter( Comic.added_ts >= dt )
            except:
                pass
        
        if hasValue(lastread_since):
            try:
                dt=dateutil.parser.parse(lastread_since)
                query = query.filter( Comic.lastread_ts >= dt, Comic.lastread_ts != "" )
            except:
                pass
        
        order_key = None
        # ATB temp hack to cover "slicing" bug where
        # if no order specified, the child collections
        # get chopped off sometimes
        if not hasValue(order):
            order = "id"
        
        if hasValue(order):
            if order[0] == "-":
                order_desc = True
                order = order[1:]
            else:
                order_desc = False
            if order == "id":
                order_key = Comic.id                
            if order == "series":
                order_key = Comic.series
            elif order == "modified":
                order_key = Comic.mod_ts
            elif order == "added":
                order_key = Comic.added_ts
            elif order == "lastread":
                order_key = Comic.lastread_ts
            elif order == "volume":
                order_key = Comic.volume
            elif order == "issue":
                order_key = Comic.issue
            elif order == "date":
                order_key = Comic.date
            elif order == "publisher":
                order_key = Comic.publisher
            elif order == "title":
                order_key = Comic.title
            elif order == "path":
                order_key = Comic.path
                
        if order_key is not None:
            if order_desc:
                order_key = order_key.desc()                
            query = query.order_by(order_key)

        return query    
    
class ZippableAPIHandler(JSONResultAPIHandler):

    def writeResults(self, json_data):
        self.setContentType()
        if self.get_argument(u"gzip", default=None) is not None:
            self.add_header("Content-Encoding","gzip")
            # TODO: make sure browser can handle gzip?
            zbuf = StringIO.StringIO()
            zfile = gzip.GzipFile(mode = 'wb',  fileobj = zbuf, compresslevel = 9)
            zfile.write(json.dumps(json_data))
            zfile.close()
    
            self.write(zbuf.getvalue())
        else:
            self.write(json_data)       

class ControlAPIHandler(GenericAPIHandler):
    def get(self):
        cmd = self.get_argument(u"cmd", default=None)
        if cmd == "restart":
            logging.info("Restart command")
            self.application.restart()
        elif cmd == "reset":
            logging.info("Rebuild DB command")
            self.application.rescan()
        elif cmd == "stop":
            logging.info("Stop command")
            self.application.shutdown()

class ImageAPIHandler(GenericAPIHandler):
    def setContentType(self, image_data):
        
        imtype = imghdr.what(StringIO.StringIO(image_data))
        self.add_header("Content-type","image/{0}".format(imtype))
    
    def getImageData(self, comic_id, pagenum):
        #TODO handle errors in this func!
        session = self.application.dm.Session()
        obj = session.query(Comic).filter(Comic.id == int(comic_id)).first()
        image_data = None
        if obj is not None:
            if int(pagenum) < obj.page_count:
                ca = ComicArchive(obj.path)
                image_data = ca.getPage(int(pagenum))
    
        if image_data is None:
            f = open(os.path.join(ComicStreamerConfig.baseDir(),"images/default.jpg"), 'r')
            image_data = f.read()
            f.close()
            
        return image_data
    
    def resizeImage(self, max, image_data):
        im = Image.open(StringIO.StringIO(image_data))
        w,h = im.size
        if max < h:
            im.thumbnail((w,max), Image.ANTIALIAS)
            output = StringIO.StringIO()
            im.save(output, format="PNG")
            return output.getvalue()
        else:
            return image_data
            
class VersionAPIHandler(JSONResultAPIHandler):
    def get(self):
        response = { 'version': self.application.version,
                    'last_build':  date.today().isoformat() }
        self.setContentType()
        self.write(response)

class DBInfoAPIHandler(JSONResultAPIHandler):
    def get(self):
        session = self.application.dm.Session()
        obj = session.query(DatabaseInfo).first()   
        response = { 'id': obj.uuid,
                    'last_updated':  obj.last_updated.isoformat(),
                    'created':  obj.created.isoformat(),
                    'comic_count': session.query(Comic).count()
                    }
        self.setContentType()
        self.write(response)
    
class ComicListAPIHandler(ZippableAPIHandler):
    def get(self):

        # create a query on all comics
        session = self.application.dm.Session()
        query = session.query(Comic)
        
        query = self.processComicQueryArgs(query)
        query, total_results = self.processPagingArgs(query)
        
        #print "-------->", query
        
        #import code; code.interact(local=locals())
        logging.debug( "before query" )
        
        #self.application.dm.engine.echo = True
        query = query.options(subqueryload('characters_raw'))
        query = query.options(subqueryload('storyarcs_raw'))
        query = query.options(subqueryload('locations_raw'))
        query = query.options(subqueryload('teams_raw'))
        #query = query.options(subqueryload('credits_raw'))
        query = query.options(subqueryload('generictags_raw'))
        
        resultset = query.all()


        logging.debug( "after query" )
        #self.application.dm.engine.echo = False
        
        logging.debug( "before JSON render" )
        json_data = resultSetToJson(resultset, "comics", total_results)
        logging.debug( "after JSON render" )
        
        self.writeResults(json_data)    

class DeletedAPIHandler(ZippableAPIHandler):
    def get(self):
    
        # get all deleted comics first
        session = self.application.dm.Session()
        resultset = session.query(DeletedComic)
        
        since_filter = self.get_argument(u"since", default=None)
        
        # now winnow it down with timestampe, if requested
        if since_filter is not None:
            try:
                dt=dateutil.parser.parse(since_filter)
                resultset = resultset.filter( DeletedComic.ts >= dt )
            except:
                pass                
        json_data = resultSetToJson(resultset, "deletedcomics")
                
        self.writeResults(json_data)    

class ComicListBrowserHandler(BaseHandler):
    def get(self):

        entity_src = self.get_argument(u"entity_src", default=None)
        if entity_src is not None:
            src=entity_src
        else:
            default_src="/comiclist"
            arg_string = ""
            ##if '?' in self.request.uri:
            #    arg_string = '?'+self.request.uri.split('?',1)[1]
            src = default_src + arg_string
        
        self.render("comic_results2.html", src=src)

class EntitiesBrowserHandler(BaseHandler):
    def get(self,args):
        arg_string = args
        #if '/' in args:
        #   arg_string = args.split('/',1)[1]
        #print arg_string
        self.render("entities.html", args=arg_string)

class ComicAPIHandler(JSONResultAPIHandler):
    def get(self, id):
        session = self.application.dm.Session()
        result = session.query(Comic).filter(Comic.id == int(id)).all()
        self.setContentType()
        self.write(resultSetToJson(result, "comics"))

class ComicBookmarkAPIHandler(JSONResultAPIHandler):
    def get(self, comic_id, pagenum):
        
        response = { 'status': -1 }
        
        session = self.application.dm.Session()
        obj = session.query(Comic).filter(Comic.id == int(comic_id)).first()
        if obj is not None:
            if int(pagenum) < obj.page_count:
                obj.lastread_ts = datetime.utcnow()
                obj.lastread_page = int(pagenum)
                session.commit()   
                response['status'] = 0
                
        self.setContentType()
        self.write(response)
        
class ComicPageAPIHandler(ImageAPIHandler):
    def get(self, comic_id, pagenum):
        
        image_data = self.getImageData(comic_id, pagenum)
        
        max_height = self.get_argument(u"max_height", default=None)
        if max_height is not None:
            try:
                max_h = int(max_height)
                image_data = self.resizeImage(max_h, image_data)
            except Exception as e:
                logging.error(e)
                pass
        
        self.setContentType(image_data)
        self.write(image_data)

class ThumbnailAPIHandler(ImageAPIHandler):
    def get(self, comic_id):
        image_data = self.getImageData(comic_id, 0)
        #now resize it
        thumbail_data = self.resizeImage(200, image_data)
    
        self.setContentType(image_data)
        self.write(thumbail_data)

class FileAPIHandler(GenericAPIHandler):
    def get(self, comic_id):

        #TODO handle errors in this func!
        session = self.application.dm.Session()
        obj = session.query(Comic).filter(Comic.id == int(comic_id)).first()
        if obj is not None:
            ca = ComicArchive(obj.path)
            if ca.isZip():
                self.add_header("Content-type","application/zip, application/octet-stream")
            else:
                self.add_header("Content-type","application/x-rar-compressed, application/octet-stream")
                
            self.add_header("Content-Disposition", "attachment; filename=" + os.path.basename(obj.path))    

            f = open(ca.path, 'r')
            file_data = f.read()
            f.close()
    
            self.write(file_data)
            
class EntityAPIHandler(JSONResultAPIHandler):
    def get(self, args):            
        session = self.application.dm.Session()
        
        arglist=args.split('/')
            
        arglist = filter(None, arglist)
        argcount = len(arglist)
        
        entities = {
                    'characters' : Character.name,
                    'persons' : Person.name,
                    'publishers' : Comic.publisher,
                    #'roles' : Role.name,
                    'series': Comic.series,
                    'volumes' : Comic.volume,
                    'teams' : Team.name,
                    'storyarcs' : StoryArc.name,
                    'locations' : Location.name,
                    'generictags' : GenericTag.name,            
                    'comics' : Comic
                    }
        #logging.debug("In EntityAPIHandler {0}".format(arglist))
        #/entity1/filter1/entity2/filter2...
    
        # validate all entities keys in args
        #( check every other item)
        for e in arglist[0::2]:
            if e not in entities:
                raise tornado.web.HTTPError(404, "Unknown entity:{0}".format(e))
        #look for dupes
        if len(arglist[0::2])!=len(set(arglist[0::2])):
            raise tornado.web.HTTPError(400, "Duplicate entity")
        #look for dupes
        if 'comics' in arglist[0::2] and arglist[-1] != "comics":
            raise tornado.web.HTTPError(400, "\"comics\" must be final entity")


        resp = ""
        # even number means listing entities
        if argcount % 2 == 0:
            name_list = [key for key in entities]
            # (remove already-traversed entities)
            for e in arglist[0::2]:
                try:
                    name_list.remove(e)
                except:    
                    pass
                
            # Find out how many of each entity are left, and build a list of
            # dicts with name and count
            dict_list = []
            for e in name_list:
                tmp_arg_list = list()
                tmp_arg_list.extend(arglist)
                tmp_arg_list.append(e)
                query = self.buildQuery(session, entities, tmp_arg_list)
                e_dict = dict()
                e_dict['name'] = e
                #self.application.dm.engine.echo = True
                e_dict['count'] = query.distinct().count()
                #self.application.dm.engine.echo = False
                #print "----", e_dict, query
                dict_list.append(e_dict)
                
            #name_list = sorted(name_list)

            resp = {"entities" : dict_list}
            self.setContentType()
            self.write(resp)
            return

        # odd number means listing last entity VALUES
        else:
            entity = arglist[-1] # the final entity in the list
            query = self.buildQuery(session, entities, arglist)
            
            if entity == "comics":
            
                query = self.processComicQueryArgs(query)
                query, total_results = self.processPagingArgs(query)

                query = query.options(subqueryload('characters_raw'))
                query = query.options(subqueryload('storyarcs_raw'))
                query = query.options(subqueryload('locations_raw'))
                query = query.options(subqueryload('teams_raw'))
                #query = query.options(subqueryload('credits_raw'))                
                query = query.options(subqueryload('generictags_raw'))                
                query = query.all()
                resp = resultSetToJson(query, "comics", total_results)                
            else:
                resp = {entity : sorted(list(set([i[0] for i in query.all()])))}
            self.application.dm.engine.echo = False

        self.setContentType()
        self.write(resp)
        
    def buildQuery(self, session, entities, arglist):
        """
         Each entity-filter pair will be made into a separate query
         and they will be all intersected together
        """

        entity = arglist[-1]
        querylist = []
        #To build up the query, bridge every entity to a comic table
        querybase = session.query(entities[entity])
        if len(arglist) != 1:
            if entity == 'roles':
                querybase = querybase.join(Credit).join(Comic)
            if entity == 'persons':
                querybase = querybase.join(Credit).join(Comic)
            if entity == 'characters':
                querybase = querybase.join(comics_characters_table).join(Comic)
            if entity == 'teams':
                querybase = querybase.join(comics_teams_table).join(Comic)
            if entity == 'storyarcs':
                querybase = querybase.join(comics_storyarcs_table).join(Comic)
            if entity == 'locations':
                querybase = querybase.join(comics_locations_table).join(Comic)
            if entity == 'generictags':
                querybase = querybase.join(comics_generictags_table).join(Comic)
        
        #print "Result entity is====>", entity
        #iterate over list, 2 at a time, building query list,
        #print zip(arglist[0::2], arglist[1::2])
        for e,v in zip(arglist[0::2], arglist[1::2]):
            #print "--->",e,v
            query = querybase
            if e == 'roles':
                if entity != 'persons':
                    query = query.join(Credit)
                query = query.join(Role)
            if e == 'persons':
                if entity != 'roles':
                    query = query.join(Credit)
                query = query.join(Person)
            if e == 'characters':
                query = query.join(comics_characters_table).join(Character)
            if e == 'teams':
                query = query.join(comics_teams_table).join(Team)
            if e == 'storyarcs':
                query = query.join(comics_storyarcs_table).join(StoryArc)
            if e == 'locations':
                query = query.join(comics_locations_table).join(Location)
            if e == 'generictags':
                query = query.join(comics_generictags_table).join(GenericTag)
            query = query.filter(entities[e]==v)
            querylist.append(query)
            #print query
                        
        if len(querylist) == 0:
            finalquery = querybase
        else:
            finalquery = querylist[0].intersect(*querylist[1:])
            
        return finalquery
        
class ReaderHandler(BaseHandler):
    def get(self, comic_id):
        session = self.application.dm.Session()
        obj = session.query(Comic).filter(Comic.id == int(comic_id)).first()
        page_data = None
        if obj is not None:
            #self.render("templates/reader.html", make_list=self.make_list, id=comic_id, count=obj.page_count)
            #self.render("test.html", make_list=self.make_list, id=comic_id, count=obj.page_count)
            
            title = os.path.basename(obj.path)
            if obj.series is not None and obj.issue is not None:
                title = obj.series + u" #" + obj.issue
                if obj.title is not None :
                    title +=  u" -- " + obj.title
            if obj.lastread_page is None:
                target_page = 0
            else:
                target_page=obj.lastread_page   
                
            self.render("cbreader.html", title=title, id=comic_id, count=obj.page_count, page=target_page)
            
        def make_list(self, id, count):
            text = u""
            for i in range(count):
                text +=  u"\'page/" + str(i) + u"\',"
            return text

class UnknownHandler(BaseHandler):
    def get(self):
            self.write("Whoops! Four-oh-four.")

class MainHandler(BaseHandler):
    def get(self):
            session = self.application.dm.Session()
            stats=dict()
            stats['total'] = session.query(Comic).count()
            dt = session.query(DatabaseInfo).first().last_updated
            stats['last_updated'] = dt.strftime("%Y-%m-%d %H:%M:%S")
            dt = session.query(DatabaseInfo).first().created
            stats['created'] = dt.strftime("%Y-%m-%d %H:%M:%S")
            
            stats['series'] = len(set(session.query(Comic.series)))
            stats['persons'] = session.query(Person).count()
            
            recently_added_comics = session.query(Comic).order_by(Comic.added_ts.desc()).limit(10)
            recently_read_comics = session.query(Comic).filter(Comic.lastread_ts != "").order_by(Comic.lastread_ts.desc()).limit(10)
            
            roles_query = session.query(Role.name)
            roles_list = [i[0] for i in list(roles_query)]

            # SQLite specific random call
            random_comic = session.query(Comic).order_by(func.random()).first()
            if random_comic is None:
                random_comic = type('fakecomic', (object,), 
                 {'id':0, 'series':'Oops', 'issue':1})()
            self.render("index.html", stats=stats,
                        random_comic=random_comic,
                        recently_added = list(recently_added_comics),
                        recently_read = list(recently_read_comics),
                        roles = roles_list)

class GenericPageHandler(BaseHandler):
    def get(self,page):
            self.render(page+".html")

class AboutPageHandler(BaseHandler):
    def get(self):
            self.render("about.html", version=self.application.version)            


class LogPageHandler(BaseHandler):
    
    def get(self):

        log_file = os.path.join(ComicStreamerConfig.getUserFolder(), "logs", "ComicStreamer.log")
        
        logtxt = ""
        for line in reversed(open(log_file).readlines()):
            logtxt += line.rstrip() + '\n'

        self.render("log.html",
                    logtxt=logtxt)
     
class ConfigPageHandler(BaseHandler):
    
    def is_port_available(self,port):    
        host = '127.0.0.1'
    
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.connect((host, port))
            s.shutdown(2)
            return False
        except Exception as e:
            print e
            return True

    def render_config(self, success="", failure=""):
        folder_str = "\n".join(self.application.config['general']['folder_list'] )
        self.render("configure.html",
                    port=self.application.config['general']['port'],
                    folders=folder_str,
                    success=success,
                    failure=failure)
        
    def get(self):
        self.render_config()
         
    def post(self):
        port_str = self.get_argument(u"port", default=None)
        folders_str = self.get_argument(u"folders", default=None)
        success_str="Saved. Server restart needed"
        failure_str=""
        failure = False
        
        old_folder_list = self.application.config['general']['folder_list']
        new_folder_list = [os.path.abspath(os.path.normpath(unicode(a))) for a in folders_str.splitlines()]

        for f in new_folder_list:
            if not (os.path.exists(f) and  os.path.isdir(f)):
                success_str = ""
                failure_str = u"Folder {0} doesn't exist.  ".format(f)
                failure = True
                break
                
        if not failure:    
            self.application.config['general']['folder_list'] = new_folder_list
        
        #TODO validate each folder exists
        
        old_port = int(self.application.config['general']['port'])
        new_port = 0
        if port_str is not None:
            try:

                new_port = int(port_str)
                if new_port > 49151 or new_port < 1024:
                    success_str = ""
                    failure_str += u"Port value out of range (1024-4151): {0}".format(new_port)
                    failure = True
                else:
                    if new_port != old_port and not self.is_port_available(new_port):
                        success_str = ""
                        failure_str += u"Port not available: {0}".format(new_port)
                        failure = True
                    else:    
                        self.application.config['general']['port'] = new_port
                #
            except:
                success_str = ""
                failure_str += u"Non-numeric port value: {0}".format(port_str)
                failure = True                
                pass                
    
        if not failure:
            
            #if new_port !=old_port:
            #    self.application.listen(new_port)
            if new_port == old_port and new_folder_list == old_folder_list:
                success_str = ""
            else:
                self.application.config.write()
                
        self.render_config(success=success_str, failure=failure_str)
            
class APIServer(tornado.web.Application):
    def __init__(self, config, opts):
        utils.fix_output_encoding()   
        
        self.config = config
        port = self.config['general']['port']
        signal.signal(signal.SIGINT, self.signal_handler)
        
        #if len(self.config['general']['folder_list']) == 0:
        #    logging.error("No folders on either command-line or config file.  Quitting.")
        #    sys.exit(-1)
        
        logging.info( "Stream server running on port {0}...".format(port))
        self.dm = DataManager()
        
        if opts.reset:
            logging.info( "Deleting any existing database!")
            self.dm.delete()
            opts.reset = False
            
        self.dm.create()
        
        self.listen(port)
        
        self.version = csversion.version
        
        handlers = [
            # Web Pages
            (r"/", MainHandler),
            (r"/(.*)\.html", GenericPageHandler),
            (r"/about", AboutPageHandler),
            (r"/configure", ConfigPageHandler),
            (r"/log", LogPageHandler),
            (r"/comiclist/browse", ComicListBrowserHandler),
            (r"/entities/browse/(.*)", EntitiesBrowserHandler),
            (r"/comic/([0-9]+)/reader", ReaderHandler),
            # Data
            (r"/dbinfo", DBInfoAPIHandler),
            (r"/version", VersionAPIHandler),
            (r"/deleted", DeletedAPIHandler),
            (r"/comic/([0-9]+)", ComicAPIHandler),
            (r"/comiclist", ComicListAPIHandler),
            (r"/comic/([0-9]+)/page/([0-9]+)/bookmark", ComicBookmarkAPIHandler ),
            (r"/comic/([0-9]+)/page/([0-9]+)", ComicPageAPIHandler ),
            (r"/comic/([0-9]+)/thumbnail", ThumbnailAPIHandler),
            (r"/comic/([0-9]+)/file", FileAPIHandler),
            (r"/entities/(.*)", EntityAPIHandler),
            (r"/control", ControlAPIHandler),
            (r'/favicon.ico', tornado.web.StaticFileHandler, {'path': "favicon.ico"}),
            (r'/.*', UnknownHandler),
            
        ]
        
        settings = dict(
            template_path=os.path.join(os.path.dirname(__file__), "templates"),
            static_path=os.path.join(os.path.dirname(__file__), "static"),
            debug=False,
            autoreload=False
        )
                
        tornado.web.Application.__init__(self, handlers, **settings)

        if not opts.no_monitor:     
            logging.debug("Going to scan the following folders:")
            for l in self.config['general']['folder_list']:
                logging.debug(u"   {0}".format(repr(l)))

            self.monitor = Monitor(self.dm, self.config['general']['folder_list'])
            self.monitor.start()
            self.monitor.scan()

    def restart(self):
        python = sys.executable
        os.execl(python, python, * sys.argv)    

    def rescan(self):
        self.dm.delete()
        self.restart()
        """
        self.monitor.stop()
        self.dm.delete()
        self.dm.create()
        self.monitor = Monitor(self.dm, self.config['general']['folder_list'])
        self.monitor.start()
        self.monitor.scan()        
        """
        
    def signal_handler(self, signal, frame):
        self.shutdown()
        
    def shutdown(self):
        
        MAX_WAIT_SECONDS_BEFORE_SHUTDOWN = 1

        #self.stop()
     
        logging.info('Will shutdown ComicStreamer in %s seconds ...', MAX_WAIT_SECONDS_BEFORE_SHUTDOWN)
        io_loop = tornado.ioloop.IOLoop.instance()
     
        deadline = time.time() + MAX_WAIT_SECONDS_BEFORE_SHUTDOWN
     
        def stop_loop():
            now = time.time()
            if now < deadline and (io_loop._callbacks or io_loop._timeouts):
                io_loop.add_timeout(now + 1, stop_loop)
            else:
                io_loop.stop()
                logging.info('Shutdown')
        stop_loop()

def main():
        
    utils.fix_output_encoding()
    
    #Configure logging
    # root level        
    logger = logging.getLogger()    
    logger.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    
    log_file = os.path.join(ComicStreamerConfig.getUserFolder(), "logs", "ComicStreamer.log")
    if not os.path.exists(os.path.dirname(log_file)):
        os.makedirs(os.path.dirname(log_file))
    fh = logging.handlers.RotatingFileHandler(log_file, maxBytes=65536, backupCount=5, encoding="UTF8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(formatter)
    logger.addHandler(fh)
    
    # By default only do info level to console
    sh = logging.StreamHandler(sys.stdout)
    sh.setLevel(logging.INFO)
    sh.setFormatter(formatter)
    logger.addHandler(sh)

    config = ComicStreamerConfig()
    opts = Options()
    opts.parseCmdLineArgs()

    # set file logging according to config file
    #fh.setLevel(config['general']['loglevel'])
        
    # turn up the log level, if requested
    if opts.debug:
        sh.setLevel(logging.DEBUG)        
        #fh.setLevel(logging.DEBUG)

    config.applyOptions(opts)
    
    app = APIServer(config, opts)

    app.logFileHandler = fh
    app.logConsoleHandler = sh    
    
    tornado.ioloop.IOLoop.instance().start()


if __name__ == "__main__":
    main()


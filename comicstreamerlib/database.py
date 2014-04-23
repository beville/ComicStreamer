#!/usr/bin/python
 
from datetime import date,datetime
import sqlalchemy
import json
import pprint 
import uuid
import logging
import os

from config import ComicStreamerConfig

from sqlalchemy.orm import scoped_session
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, String, DateTime, Table, ForeignKey
from sqlalchemy.orm import relationship, backref
from sqlalchemy import create_engine, func
from sqlalchemy.ext.declarative import DeclarativeMeta
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.ext.associationproxy import _AssociationList
from sqlalchemy.orm.properties import \
                        ColumnProperty,\
                        CompositeProperty,\
                        RelationshipProperty
from sqlalchemy.ext.hybrid import hybrid_property, hybrid_method


Base = declarative_base()
Session = sessionmaker()

def resultSetToJson(rset, listname="aaData", total=None):
    return json.dumps(resultSetToDict(rset, listname, total), cls=alchemy_encoder(), check_circular=False)

def resultSetToDict(rset, listname="aaData", total=None):
    l = []
    for r in rset:
        l.append(r)
        
    results_dict = {}
    results_dict[listname] = l
    results_dict['page_count'] = len(l)
    if total is None:
        results_dict['total_count'] = len(l)
    else:
        results_dict['total_count'] = total
      
    return results_dict


def alchemy_encoder():
    _visited_objs = []
    class AlchemyEncoder(json.JSONEncoder):
        def default(self, obj):

            if isinstance(obj,_AssociationList):
                # Convert association list into python list
                return list(obj)
            
            if isinstance(obj.__class__, DeclarativeMeta):
                # don't re-visit self
                if obj in _visited_objs:
                    return None
                _visited_objs.append(obj)

                # an SQLAlchemy class
                fields = {}
                for field in [x for x in dir(obj) if not x.startswith('_')
                                                    and x != 'metadata'
                                                    and not x.endswith('_raw')
                                                    and x != "persons" 
                                                    and x != "roles" 
                                                    ]:
                    value = obj.__getattribute__(field)
                    if (isinstance(value, date)): 
                        value = str(value)
                    
                    if value is not None:
                        fields[field] = value
                    else:
                        fields[field] = ""
                        
                # a json-encodable dict
                return fields

            return json.JSONEncoder.default(self, obj)
    return AlchemyEncoder


        
        
# Junction table
comics_characters_table = Table('comics_characters', Base.metadata,
    Column('comic_id', Integer, ForeignKey('comics.id')),
    Column('character_id', Integer, ForeignKey('characters.id'))
)

# Junction table
comics_teams_table = Table('comics_teams', Base.metadata,
    Column('comic_id', Integer, ForeignKey('comics.id')),
    Column('team_id', Integer, ForeignKey('teams.id'))
)

# Junction table
comics_locations_table = Table('comics_locations', Base.metadata,
    Column('comic_id', Integer, ForeignKey('comics.id')),
    Column('location_id', Integer, ForeignKey('locations.id'))
)

# Junction table
comics_storyarcs_table = Table('comics_storyarcs', Base.metadata,
    Column('comic_id', Integer, ForeignKey('comics.id')),
    Column('storyarc_id', Integer, ForeignKey('storyarcs.id'))
)

# Junction table
comics_generictags_table = Table('comics_generictags', Base.metadata,
     Column('comic_id', Integer, ForeignKey('comics.id')),
     Column('generictags_id', Integer, ForeignKey('generictags.id'))
)


class CreditComparator(RelationshipProperty.Comparator):
    def __eq__(self, other):
        return self.person() == other

class MyComparator(ColumnProperty.Comparator):
    def __eq__(self, other):
        #return func.lower(self.__clause_element__()) == func.lower(other)
        #print "-----------ATB------", type(self.__clause_element__()), type(other)
        # for the children objects, make all equal comparisons be likes
        return self.__clause_element__().ilike(func.lower(unicode(other)))


class Comic(Base):
    __tablename__ = 'comics'
    __table_args__ = {'sqlite_autoincrement': True}

    id = Column(Integer, primary_key=True)
    path = Column(String, unique=True)
    series = Column(String)
    issue = Column(String)
    date = Column(DateTime)  # will be a composite of month,year,day for sorting/filtering
    day = Column(Integer)
    month = Column(Integer)
    year = Column(Integer)
    volume = Column(Integer)
    page_count = Column(Integer)
    comments = Column(String)
    publisher = Column(String)
    title = Column(String)
    genre = Column(String)
    imprint = Column(String)
    weblink = Column(String)
    filesize = Column(Integer)
    hash = Column(String)
    deleted_ts = Column(DateTime)
    lastread_ts = Column(DateTime)
    lastread_page = Column(Integer)
    
    
    #hash = Column(String)
    added_ts = Column(DateTime, default=datetime.utcnow)  # when the comic was added to the DB
    mod_ts = Column(DateTime)  # the last modified date of the file
    
    credits_raw = relationship('Credit', #secondary=credits_,
                                cascade="all, delete", )#, backref='comics')
    characters_raw = relationship('Character', secondary=comics_characters_table,
                                cascade="delete")#, backref='comics')
    teams_raw = relationship('Team', secondary=comics_teams_table,
                                cascade="delete") #)#, backref='comics')
    locations_raw = relationship('Location', secondary=comics_locations_table,
                                cascade="delete") #, backref='comics')
    storyarcs_raw = relationship('StoryArc', secondary=comics_storyarcs_table,
                                cascade="delete") #, backref='comics')
    generictags_raw = relationship('GenericTag', secondary=comics_generictags_table,
                                cascade="delete") #, backref='comics')

    persons_raw = relationship("Person",
                secondary="join(Credit, Person, Credit.person_id == Person.id)",
                primaryjoin="and_(Comic.id == Credit.comic_id)",
                #passive_updates=False,
                viewonly=True
                )
    roles_raw = relationship("Role",
                secondary="join(Credit, Role, Credit.role_id == Role.id)",
                primaryjoin="and_(Comic.id == Credit.comic_id)",
                #passive_updates=False,
                viewonly=True               
                )

    #credits = association_proxy('credits_raw', 'person_role_dict')
    characters = association_proxy('characters_raw', 'name')
    teams = association_proxy('teams_raw', 'name')
    locations = association_proxy('locations_raw', 'name')
    storyarcs = association_proxy('storyarcs_raw', 'name')
    generictags = association_proxy('generictags_raw', 'name')
    persons = association_proxy('persons_raw', 'name')
    roles = association_proxy('roles_raw', 'name')
     
    def __repr__(self):
        out = u"<Comic(id={0}, path={1},\n series={2}, issue={3}, year={4} pages={5}\n{6}".format(
            self.id, self.path,self.series,self.issue,self.year,self.page_count,self.characters)
        return out
    @property
    def credits(self):
        """Merge credits together into a dict with role name as key, and lists of persons"""
        
        out_dict = {}
        # iterate over the list of credits mini dicts:
        for c in self.credits_raw:
            if not out_dict.has_key(c.role.name):
                out_dict[c.role.name] = []
            out_dict[c.role.name].append(c.person.name)
        
        return out_dict

class Credit(Base):
    __tablename__ = 'credits'
    #__table_args__ = {'extend_existing': True}
    comic_id = Column(Integer, ForeignKey('comics.id'), primary_key=True)
    role_id = Column(Integer, ForeignKey('roles.id'), primary_key=True)
    person_id = Column(Integer, ForeignKey('persons.id'), primary_key=True)

    #bidirectional attribute/collection of "comic"/"credits"
    #comic = relationship(Comic,
    #            backref=backref("credits_backref_raw"),
    #                            #cascade="all, delete-orphan")
    #        )

    person = relationship("Person", cascade="all, delete") #, backref='credits')
    role = relationship("Role" , cascade="all, delete") #, backref='credits')

    def __init__(self, person=None, role=None):
        self.person = person
        self.role = role
    
    #@property
    #def person_role_tuple(self):
    #   return (self.person.name, self.role.name)
    
    #@property
    #def person_role_dict(self):
    #   return { self.role.name : [self.person.name] }
        
    #def __repr__(self):
    #   return u"<Credit(person={0},role={1})>".format(self.person_role_tuple[1], self.person_role_tuple[0])
        
        
class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True)
    name = ColumnProperty(
                    Column('name', String, unique = True),
                    comparator_factory=MyComparator)

class Person(Base):
    __tablename__ = "persons"
    id = Column(Integer, primary_key=True)
    name = ColumnProperty(
                    Column('name', String, unique = True),
                    comparator_factory=MyComparator)

    
class Character(Base):
    __tablename__ = "characters"
    id = Column(Integer, primary_key=True)
    #name = Column(String, unique=True)
    name = ColumnProperty(
                    Column('name', String, unique = True),
                    comparator_factory=MyComparator
                )   
    
    def __repr__(self):
        out = u"<Character(id={0},name='{1}')>".format(self.id, self.name)
        return out

class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True)
    name = ColumnProperty(
                    Column('name', String, unique = True),
                    comparator_factory=MyComparator)
        
class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True)
    name = ColumnProperty(
                    Column('name', String, unique = True),
                    comparator_factory=MyComparator)

class StoryArc(Base):
    __tablename__ = "storyarcs"
    id = Column(Integer, primary_key=True)
    name = ColumnProperty(
                    Column('name', String, unique = True),
                    comparator_factory=MyComparator)

class GenericTag(Base):
    __tablename__ = "generictags"
    id = Column(Integer, primary_key=True)
    name = ColumnProperty(
                    Column('name', String, unique = True),
                    comparator_factory=MyComparator)
    
class DeletedComic(Base):
    __tablename__ = "deletedcomics"
    id = Column(Integer, primary_key=True)
    comic_id = Column(Integer)
    ts = Column(DateTime, default=datetime.utcnow)  

    def __unicode__(self):
        out = u"DeletedComic: {0}:{1}".format(self.id, self.comic_id)
        return out

class DatabaseInfo(Base):
    __tablename__ = "dbid"
    id = Column(Integer, primary_key=True)
    uuid = Column(String)
    created = Column(DateTime, default=datetime.utcnow)
    last_updated = Column(DateTime)
    
    def __str__(self):
        out = u"{0}".format(self.uuid)
        return out
                    
class DataManager():
    def __init__(self):
        self.dbfile = os.path.join(ComicStreamerConfig.getUserFolder(), "comicdb.sqlite")

    def delete(self):
        if os.path.exists( self.dbfile ):
            os.unlink( self.dbfile )
            
    def create(self):
        
        self.engine = create_engine('sqlite:///'+ self.dbfile, echo=False)

        session_factory = sessionmaker(bind=self.engine)
        self.Session = scoped_session(session_factory) 

        # if we don't have a UUID for this DB, add it.
        Base.metadata.create_all(self.engine) 

        session = self.Session()
        
        results = session.query(DatabaseInfo).first()
        if results is None:
           dbinfo = DatabaseInfo()
           dbinfo.uuid = unicode(uuid.uuid4().hex)
           dbinfo.last_updated = datetime.utcnow()
           session.add(dbinfo)
           session.commit()
           logging.debug("Added new uuid".format(dbinfo.uuid))

if __name__ == "__main__":
    dm = DataManager()
    dm.create()


   

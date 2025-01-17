'use strict';

var adapters = ['http', 'local'];

adapters.forEach(function (adapter) {
  describe('test.all_docs.js-' + adapter, function () {

    var dbs = {};
    beforeEach(function (done) {
      dbs = {name: testUtils.adapterUrl(adapter, 'testdb')};
      testUtils.cleanup([dbs.name], done);
    });

    afterEach(function (done) {
      testUtils.cleanup([dbs.name], done);
    });


    var origDocs = [
      {_id: '0', a: 1, b: 1},
      {_id: '3', a: 4, b: 16},
      {_id: '1', a: 2, b: 4},
      {_id: '2', a: 3, b: 9}
    ];

    it('Testing all docs', function (done) {
      var db = new PouchDB(dbs.name);
      testUtils.writeDocs(db, JSON.parse(JSON.stringify(origDocs)),
        function () {
        db.allDocs(function (err, result) {
          should.not.exist(err);
          var rows = result.rows;
          result.total_rows.should.equal(4, 'correct number of results');
          for (var i = 0; i < rows.length; i++) {
            rows[i].id.should.be.at.least('0');
            rows[i].id.should.be.at.most('4');
          }
          db.allDocs({
            startkey: '2',
            include_docs: true
          }, function (err, all) {
            all.rows.should.have
              .length(2, 'correct number when opts.startkey set');
            all.rows[0].id.should
              .equal('2', 'correct docs when opts.startkey set');
            var opts = {
              startkey: 'org.couchdb.user:',
              endkey: 'org.couchdb.user;'
            };
            db.allDocs(opts, function (err, raw) {
              raw.rows.should.have.length(0, 'raw collation');
              var ids = ['0', '3', '1', '2'];
              db.changes().on('complete', function (changes) {
                // order of changes is not guaranteed in a
                // clustered changes feed
                changes.results.forEach(function (row) {
                  ids.should.include(row.id, 'seq order');
                });
                db.changes({
                  descending: true
                }).on('complete', function (changes) {
                  // again, order is not guaranteed so
                  // unsure if this is a useful test
                  ids = ['2', '1', '3', '0'];
                  changes.results.forEach(function (row) {
                    ids.should.include(row.id, 'descending=true');
                  });
                  done();
                }).on('error', done);
              }).on('error', done);
            });
          });
        });
      });
    });

    it('Testing allDocs opts.keys', function () {
      var db = new PouchDB(dbs.name);
      function keyFunc(doc) {
        return doc.key;
      }
      var keys;
      return db.bulkDocs(origDocs).then(function () {
        keys = ['3', '1'];
        return db.allDocs({keys: keys});
      }).then(function (result) {
        result.rows.map(keyFunc).should.deep.equal(keys);
        keys = ['2', '0', '1000'];
        return db.allDocs({ keys: keys });
      }).then(function (result) {
        result.rows.map(keyFunc).should.deep.equal(keys);
        result.rows[2].error.should.equal('not_found');
        return db.allDocs({
          keys: keys,
          descending: true
        });
      }).then(function (result) {
        result.rows.map(keyFunc).should.deep.equal(['1000', '0', '2']);
        result.rows[0].error.should.equal('not_found');
        return db.allDocs({
          keys: keys,
          startkey: 'a'
        });
      }).then(function () {
        throw new Error('expected an error');
      }, function (err) {
        should.exist(err);
        return db.allDocs({
          keys: keys,
          endkey: 'a'
        });
      }).then(function () {
          throw new Error('expected an error');
        }, function (err) {
        should.exist(err);
        return db.allDocs({keys: []});
      }).then(function (result) {
        result.rows.should.have.length(0);
        return db.get('2');
      }).then(function (doc) {
        return db.remove(doc);
      }).then(function () {
        return db.allDocs({
          keys: keys,
          include_docs: true
        });
      }).then(function (result) {
        result.rows.map(keyFunc).should.deep.equal(keys);
        result.rows[keys.indexOf('2')].value.deleted.should.equal(true, 'deleted doc with keys option');
        (result.rows[keys.indexOf('2')].doc === null).should.equal(true, 'deleted doc with keys option');
      });
    });

    it('Testing allDocs opts.keys with skip', function () {
      var db = new PouchDB(dbs.name);
      return db.bulkDocs(origDocs).then(function () {
        return db.allDocs({
          keys: ['3', '1'],
          skip: 1
        });
      }).then(function (res) {
        res.total_rows.should.equal(4);
        res.rows.should.have.length(1);
        res.rows[0].id.should.equal('1');
      });
    });

    it('Testing allDocs opts.keys with limit', function () {
      var db = new PouchDB(dbs.name);
      return db.bulkDocs(origDocs).then(function () {
        return db.allDocs({
          keys: ['3', '1'],
          limit: 1
        });
      }).then(function (res) {
        res.total_rows.should.equal(4);
        res.rows.should.have.length(1);
        res.rows[0].id.should.equal('3');
        return db.allDocs({
          keys: ['0', '2'],
          limit: 3
        });
      }).then(function (res) {
        res.rows.should.have.length(2);
        res.rows[0].id.should.equal('0');
        res.rows[1].id.should.equal('2');
      });
    });

    it('Testing allDocs invalid opts.keys', function () {
      var db = new PouchDB(dbs.name);
      return db.allDocs({keys: 1234}).then(function () {
        throw new Error('should not be here');
      }).catch(function (err) {
        should.exist(err);
      });
    });

    it('Testing deleting in changes', function (done) {
      var db = new PouchDB(dbs.name);

      db.info(function (err, info) {
        var update_seq = info.update_seq;
        
        testUtils.writeDocs(db, JSON.parse(JSON.stringify(origDocs)),
          function () {
          db.get('1', function (err, doc) {
            db.remove(doc, function (err, deleted) {
              should.exist(deleted.ok);

              db.changes({
                return_docs: true,
                since: update_seq
              }).on('complete', function (changes) {
                var deleted_ids = changes.results.map(function (c) {
                  if (c.deleted) { return c.id; }
                });
                deleted_ids.should.include('1');

                done();
              }).on('error', done);
            });
          });
        });
      });
    });

    it('Testing updating in changes', function (done) {
      var db = new PouchDB(dbs.name);

      db.info(function (err, info) {
        var update_seq = info.update_seq;
        
        testUtils.writeDocs(db, JSON.parse(JSON.stringify(origDocs)), 
          function () {
          db.get('3', function (err, doc) {
            doc.updated = 'totally';
            db.put(doc, function () {
              db.changes({
                return_docs: true,
                since: update_seq
              }).on('complete', function (changes) {
                var ids = changes.results.map(function (c) { return c.id; });
                ids.should.include('3');

                done();
              }).on('error', done);
            });
          });
        });
      });
    });

    it('Testing include docs', function (done) {
      var db = new PouchDB(dbs.name);
      testUtils.writeDocs(db, JSON.parse(JSON.stringify(origDocs)),
        function () {
        db.changes({
          include_docs: true
        }).on('complete', function (changes) {
          changes.results.forEach(function (row) {
            if (row.id === '0') {
              row.doc.a.should.equal(1);
            }
          });
          done();
        }).on('error', done);
      });
    });

    it('Testing conflicts', function (done) {
      var db = new PouchDB(dbs.name);
      testUtils.writeDocs(db, JSON.parse(JSON.stringify(origDocs)),
        function () {
        // add conflicts
        var conflictDoc1 = {
          _id: '3',
          _rev: '2-aa01552213fafa022e6167113ed01087',
          value: 'X'
        };
        var conflictDoc2 = {
          _id: '3',
          _rev: '2-ff01552213fafa022e6167113ed01087',
          value: 'Z'
        };
        db.put(conflictDoc1, { new_edits: false }, function () {
          db.put(conflictDoc2, { new_edits: false }, function () {
            db.get('3', function (err, winRev) {
              winRev._rev.should.equal(conflictDoc2._rev);
              db.changes({
                return_docs: true,
                include_docs: true,
                conflicts: true,
                style: 'all_docs'
              }).on('complete', function (changes) {
                changes.results.map(function (x) { return x.id; }).sort()
                  .should.deep.equal(['0', '1', '2', '3'],
                    'all ids are in _changes');

                var result = changes.results.filter(function (row) {
                  return row.id === '3';
                })[0];

                result.changes.should.have
                  .length(3, 'correct number of changes');
                result.doc._rev.should.equal(conflictDoc2._rev);
                result.doc._id.should.equal('3', 'correct doc id');
                winRev._rev.should.equal(result.doc._rev);
                result.doc._conflicts.should.be.instanceof(Array);
                result.doc._conflicts.should.have.length(2);
                conflictDoc1._rev.should.equal(result.doc._conflicts[0]);

                db.allDocs({
                  include_docs: true,
                  conflicts: true
                }, function (err, res) {
                  var row = res.rows[3];
                  res.rows.should.have.length(4, 'correct number of changes');
                  row.key.should.equal('3', 'correct key');
                  row.id.should.equal('3', 'correct id');
                  row.value.rev.should.equal(winRev._rev, 'correct rev');
                  row.doc._rev.should.equal(winRev._rev, 'correct rev');
                  row.doc._id.should.equal('3', 'correct order');
                  row.doc._conflicts.should.be.instanceof(Array);
                  row.doc._conflicts.should.have.length(2);
                  conflictDoc1._rev.should
                    .equal(res.rows[3].doc._conflicts[0]);
                  done();
                });
              }).on('error', done);
            });
          });
        });
      });
    });

    it('test basic collation', function (done) {
      var db = new PouchDB(dbs.name);
      var docs = {
        docs: [
          {_id: 'z', foo: 'z'},
          {_id: 'a', foo: 'a'}
        ]
      };
      db.bulkDocs(docs, function () {
        db.allDocs({
          startkey: 'z',
          endkey: 'z'
        }, function (err, result) {
          result.rows.should.have.length(1, 'Exclude a result');
          done();
        });
      });
    });

    it('3883 start_key end_key aliases', function () {
      var db = new PouchDB(dbs.name);
      var docs = [{_id: 'a', foo: 'a'}, {_id: 'z', foo: 'z'}];
      return db.bulkDocs(docs).then(function () {
        return db.allDocs({start_key: 'z', end_key: 'z'});
      }).then(function (result) {
        result.rows.should.have.length(1, 'Exclude a result');
      });
    });

    it('test total_rows with a variety of criteria', function (done) {
      this.timeout(20000);
      var db = new PouchDB(dbs.name);

      var docs = [
        {_id : '0'},
        {_id : '1'},
        {_id : '2'},
        {_id : '3'},
        {_id : '4'},
        {_id : '5'},
        {_id : '6'},
        {_id : '7'},
        {_id : '8'},
        {_id : '9'}
      ];
      db.bulkDocs({docs : docs}).then(function (res) {
        docs[3]._deleted = true;
        docs[7]._deleted = true;
        docs[3]._rev = res[3].rev;
        docs[7]._rev = res[7].rev;
        return db.remove(docs[3]);
      }).then(function () {
          return db.remove(docs[7]);
        }).then(function () {
          return db.allDocs();
        }).then(function (res) {
          res.rows.should.have.length(8,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '5'});
        }).then(function (res) {
          res.rows.should.have.length(4,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '5', skip : 2, limit : 10});
        }).then(function (res) {
          res.rows.should.have.length(2,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '5', limit : 0});
        }).then(function (res) {
          res.rows.should.have
            .length(0,  'correctly return rows, startkey w/ limit=0');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({keys : ['5'], limit : 0});
        }).then(function (res) {
          res.rows.should.have
            .length(0,  'correctly return rows, keys w/ limit=0');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({limit : 0});
        }).then(function (res) {
          res.rows.should.have.length(0,  'correctly return rows, limit=0');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '5', descending : true, skip : 1});
        }).then(function (res) {
          res.rows.should.have.length(4,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '5', endkey : 'z'});
        }).then(function (res) {
          res.rows.should.have.length(4,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '5', endkey : '5'});
        }).then(function (res) {
          res.rows.should.have.length(1,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '5', endkey : '4'});
        }).then(function (res) {
          res.rows.should.have.length(0,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '5', endkey : '4', descending : true});
        }).then(function (res) {
          res.rows.should.have.length(2,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '3', endkey : '7', descending : false});
        }).then(function (res) {
          res.rows.should.have.length(3,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '7', endkey : '3', descending : true});
        }).then(function (res) {
          res.rows.should.have.length(3,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({startkey : '', endkey : '0'});
        }).then(function (res) {
          res.rows.should.have.length(1,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({keys : ['0', '1', '3']});
        }).then(function (res) {
          res.rows.should.have.length(3,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({keys : ['0', '1', '0', '2', '1', '1']});
        }).then(function (res) {
          res.rows.should.have.length(6,  'correctly return rows');
          res.rows.map(function (row) { return row.key; }).should.deep.equal(
            ['0', '1', '0', '2', '1', '1']);
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({keys : []});
        }).then(function (res) {
          res.rows.should.have.length(0,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({keys : ['7']});
        }).then(function (res) {
          res.rows.should.have.length(1,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({key : '3'});
        }).then(function (res) {
          res.rows.should.have.length(0,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({key : '2'});
        }).then(function (res) {
          res.rows.should.have.length(1,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          return db.allDocs({key : 'z'});
        }).then(function (res) {
          res.rows.should.have.length(0,  'correctly return rows');
          res.total_rows.should.equal(8,  'correctly return total_rows');
          done();
        }, done);

    });

    it('test total_rows with both skip and limit', function (done) {
      var db = new PouchDB(dbs.name);
      var docs = {
        docs: [
          {_id: "w", foo: "w"},
          {_id: "x", foo: "x"},
          {_id: "y", foo: "y"},
          {_id: "z", foo: "z"}
        ]
      };
      db.bulkDocs(docs, function () {
        db.allDocs({ startkey: 'x', limit: 1, skip : 1}, function (err, res) {
          res.total_rows.should.equal(4,  'Accurately return total_rows count');
          res.rows.should.have.length(1,  'Correctly limit the returned rows');
          res.rows[0].id.should.equal('y', 'Correctly skip 1 doc');

          db.get('x', function (err, xDoc) {
            db.remove(xDoc, function () {
              db.allDocs({ startkey: 'w', limit: 2, skip : 1},
                function (err, res) {
                res.total_rows.should
                  .equal(3,  'Accurately return total_rows count after delete');
                res.rows.should.have
                  .length(2,  'Correctly limit the returned rows after delete');
                res.rows[0].id.should
                  .equal('y', 'Correctly skip 1 doc after delete');
                done();
              });
            });
          });
        });
      });
    });

    it('test limit option and total_rows', function (done) {
      var db = new PouchDB(dbs.name);
      var docs = {
        docs: [
          {_id: 'z', foo: 'z'},
          {_id: 'a', foo: 'a'}
        ]
      };
      db.bulkDocs(docs, function () {
        db.allDocs({
          startkey: 'a',
          limit: 1
        }, function (err, res) {
          res.total_rows.should.equal(2, 'Accurately return total_rows count');
          res.rows.should.have.length(1, 'Correctly limit the returned rows.');
          done();
        });
      });
    });

    it('test escaped startkey/endkey', function (done) {
      var db = new PouchDB(dbs.name);
      var id1 = '"weird id!" a';
      var id2 = '"weird id!" z';
      var docs = {
        docs: [
          {
            _id: id1,
            foo: 'a'
          },
          {
            _id: id2,
            foo: 'z'
          }
        ]
      };
      db.bulkDocs(docs, function () {
        db.allDocs({
          startkey: id1,
          endkey: id2
        }, function (err, res) {
          res.total_rows.should.equal(2, 'Accurately return total_rows count');
          done();
        });
      });
    });

    it('test "key" option', function (done) {
      var db = new PouchDB(dbs.name);
      db.bulkDocs({
        docs: [
          { _id: '0' },
          { _id: '1' },
          { _id: '2' }
        ]
      }, function (err) {
        should.not.exist(err);
        db.allDocs({ key: '1' }, function (err, res) {
          res.rows.should.have.length(1, 'key option returned 1 doc');
          db.allDocs({
            key: '1',
            keys: [
              '1',
              '2'
            ]
          }, function (err) {
            should.exist(err);
            db.allDocs({
              key: '1',
              startkey: '1'
            }, function (err) {
              should.not.exist(err);
              db.allDocs({
                key: '1',
                endkey: '1'
              }, function (err) {
                should.not.exist(err);
                // when mixing key/startkey or key/endkey, the results
                // are very weird and probably undefined, so don't go beyond
                // verifying that there's no error
                done();
              });
            });
          });
        });
      });
    });

    it('test inclusive_end=false', function () {
      var db = new PouchDB(dbs.name);
      var docs = [
        { _id: '1' },
        { _id: '2' },
        { _id: '3' },
        { _id: '4' }
      ];
      return db.bulkDocs({docs: docs}).then(function () {
        return db.allDocs({inclusive_end: false, endkey: '2'});
      }).then(function (res) {
        res.rows.should.have.length(1);
        return db.allDocs({inclusive_end: false, endkey: '1'});
      }).then(function (res) {
        res.rows.should.have.length(0);
        return db.allDocs({inclusive_end: false, endkey: '1',
                           startkey: '0'});
      }).then(function (res) {
        res.rows.should.have.length(0);
        return db.allDocs({inclusive_end: false, endkey: '5'});
      }).then(function (res) {
        res.rows.should.have.length(4);
        return db.allDocs({inclusive_end: false, endkey: '4'});
      }).then(function (res) {
        res.rows.should.have.length(3);
        return db.allDocs({inclusive_end: false, endkey: '4',
                           startkey: '3'});
      }).then(function (res) {
        res.rows.should.have.length(1);
        return db.allDocs({inclusive_end: false, endkey: '1',
                           descending: true});
      }).then(function (res) {
        res.rows.should.have.length(3);
        return db.allDocs({inclusive_end: true, endkey: '4'});
      }).then(function (res) {
        res.rows.should.have.length(4);
        return db.allDocs({
          descending: true,
          startkey: '3',
          endkey: '2',
          inclusive_end: false
        });
      }).then(function (res) {
        res.rows.should.have.length(1);
      });
    });

    it('test descending with startkey/endkey', function () {
      var db = new PouchDB(dbs.name);
      return db.bulkDocs([
        {_id: 'a'},
        {_id: 'b'},
        {_id: 'c'},
        {_id: 'd'},
        {_id: 'e'}
      ]).then(function () {
        return db.allDocs({
          descending: true,
          startkey: 'd',
          endkey: 'b'
        });
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['d', 'c', 'b']);
        return db.allDocs({
          descending: true,
          startkey: 'd',
          endkey: 'b',
          inclusive_end: false
        });
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['d', 'c']);
        return db.allDocs({
          descending: true,
          startkey: 'd',
          endkey: 'a',
          skip: 1,
          limit: 2
        });
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['c', 'b']);
        return db.allDocs({
          descending: true,
          startkey: 'd',
          endkey: 'a',
          skip: 1
        });
      }).then(function (res) {
        var ids = res.rows.map(function (x) { return x.id; });
        ids.should.deep.equal(['c', 'b', 'a']);
      });
    });

    it('#3082 test wrong num results returned', function () {
      var db = new PouchDB(dbs.name);
      var docs = [];
      for (var i = 0; i < 1000; i++) {
        docs.push({});
      }

      var lastkey;
      var allkeys = [];

      function paginate() {
        var opts = {include_doc: true, limit: 100};
        if (lastkey) {
          opts.startkey = lastkey;
          opts.skip = 1;
        }
        return db.allDocs(opts).then(function (res) {
          if (!res.rows.length) {
            return;
          }
          if (lastkey) {
            res.rows[0].key.should.be.above(lastkey);
          }
          res.rows.should.have.length(100);
          lastkey = res.rows.pop().key;
          allkeys.push(lastkey);
          return paginate();
        });
      }

      return db.bulkDocs(docs).then(function () {
        return paginate().then(function () {
          // try running all queries at once to try to isolate race condition
          return testUtils.Promise.all(allkeys.map(function (key) {
            return db.allDocs({
              limit: 100,
              include_docs: true,
              startkey: key,
              skip: 1
            }).then(function (res) {
              if (!res.rows.length) {
                return;
              }
              res.rows[0].key.should.be.above(key);
              res.rows.should.have.length(100);
            });
          }));
        });
      });
    });

    it('test empty db', function () {
      var db = new PouchDB(dbs.name);
      return db.allDocs().then(function (res) {
        res.rows.should.have.length(0);
        res.total_rows.should.equal(0);
      });
    });

    it('test after db close', function () {
      var db = new PouchDB(dbs.name);
      return db.close().then(function () {
        return db.allDocs().catch(function (err) {
          err.message.should.equal('database is closed');
        });
      });
    });

    if (adapter === 'local') { // chrome doesn't like \u0000 in URLs
      it('test unicode ids and revs', function () {
        var db = new PouchDB(dbs.name);
        var id = 'baz\u0000';
        var rev;
        return db.put({_id: id}).then(function (res) {
          rev = res.rev;
        }).then(function () {
          return db.get(id);
        }).then(function (doc) {
          doc._id.should.equal(id);
          doc._rev.should.equal(rev);
          return db.allDocs({keys: [id]});
        }).then(function (res) {
          res.rows.should.have.length(1);
          res.rows[0].value.rev.should.equal(rev);
        });
      });
    }

    it('5793 _conflicts should not exist if no conflicts', function () {
      var db = new PouchDB(dbs.name);
      return db.put({
        _id: '0', a: 1
      }).then(function () {
        return db.allDocs({
          include_docs: true,
          conflicts: true
        });
      }).then(function (result) {
        should.not.exist(result.rows[0].doc._conflicts);
      });
    });
    
    it('#6230 Test allDocs opts update_seq: false', function () {
      var db = new PouchDB(dbs.name);
      return db.bulkDocs(origDocs).then(function () {
        return db.allDocs({
          update_seq: false
        });
      }).then(function (result) {
        result.rows.should.have.length(4);
        should.not.exist(result.update_seq);
      });
    });
    
    
    it('#6230 Test allDocs opts update_seq: true', function () {

      var db = new PouchDB(dbs.name);

      return db.bulkDocs(origDocs).then(function () {
        return db.allDocs({
          update_seq: true
        });
      }).then(function (result) {
        result.rows.should.have.length(4);
        should.exist(result.update_seq);
        result.update_seq.should.satisfy(function (update_seq) {
          if (typeof update_seq === 'number' || typeof update_seq === 'string') {
            return true;
          } else {
            return false;
          }
        });
        var normSeq = normalizeSeq(result.update_seq);
        normSeq.should.be.a('number');
      });

      function normalizeSeq(seq) {
        try {
          if (typeof seq === 'string' && seq.indexOf('-') > 0) {
            return parseInt(seq.substring(0, seq.indexOf('-')));
          }
          return seq;
        } catch (err) {
          return seq;
        }
      }
    });

    it('#6230 Test allDocs opts with update_seq missing', function () {
      var db = new PouchDB(dbs.name);
      return db.bulkDocs(origDocs).then(function () {
        return db.allDocs();
      }).then(function (result) {
        result.rows.should.have.length(4);
        should.not.exist(result.update_seq);
      });
    });
  });
});

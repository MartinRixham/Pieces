define([
	"qunit",
	"js/pieces/SelectNavPiece",
	"js/pieces/NavPiece",
	"js/pieces/Route"
], function(
	QUnit,
	SelectNavPiece,
	NavPiece,
	Route) {

	QUnit.module("Select Nav Piece");

	QUnit.testStart(function() {

		location.hash = "";
		Route.reset();
	});

	QUnit.test("Nav with two pages", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		var nav =
			new SelectNavPiece([
				{ route: "path", page: pageOne },
				{ route: "route", page: pageTwo }
			]);

		nav.onBind(container);

		assert.strictEqual(nav.datumPiecesPages[0], pageOne);
		assert.strictEqual(nav.datumPiecesPages[1], pageTwo);

		assert.strictEqual(nav.getCurrentIndex(), -1);
		assert.strictEqual(location.hash, "");
	});

	QUnit.test("Nav with sub-navigation", function(assert) {

		var done = assert.async();

		var firstPage = {};
		var secondPage = {};

		var pageOne = {};

		var pageTwo =
			new NavPiece([
				{ route: "one", page: firstPage },
				{ route: "two", page: secondPage }
			]);

		var nav =
			new SelectNavPiece([
				{ route: "path", page: pageOne },
				{ route: "route", page: pageTwo }
			]);

		nav.onBind(document.createElement("DIV"));
		pageTwo.onBind(document.createElement("DIV"));

		location.hash = "route/two";

		setTimeout(function() {

			assert.strictEqual(nav.getCurrentIndex(), 1);
			assert.strictEqual(pageTwo.datumPiecesCurrentPage, secondPage);

			done();
		}, 1050);
	});

	QUnit.test("Navigate from route with sub-navigation", function(assert) {

		var done = assert.async();

		location.hash = "route/two";
		Route.reset();

		var firstPage = {};
		var secondPage = {};

		var pageOne = {};

		var pageTwo =
			new NavPiece([
				{ route: "one", page: firstPage },
				{ route: "two", page: secondPage }
			]);

		var nav =
			new SelectNavPiece([
				{ route: "path", page: pageOne },
				{ route: "route", page: pageTwo }
			]);

		nav.onBind(document.createElement("DIV"));
		pageTwo.onBind(document.createElement("DIV"));

		setTimeout(function() {

			assert.strictEqual(nav.getCurrentIndex(), 1);
			assert.strictEqual(pageTwo.datumPiecesCurrentPage, secondPage);

			done();
		}, 1050);
	});
});

define([
	"Datum",
	"qunit",
	"js/pieces/RouterPiece",
	"js/pieces/NavPiece",
	"js/pieces/SlideNavPiece",
	"js/pieces/Route"
], function(
	Datum,
	QUnit,
	RouterPiece,
	NavPiece,
	SlideNavPiece,
	Route) {

	QUnit.module("Nesting");

	QUnit.testStart(function() {

		location.hash = "";
		Route.reset();
	});

	QUnit.test("Router piece in slide nav piece", function(assert) {

		location.hash = "start/end";
		Route.reset();

		var parent = {};

		var parentRouter =
			new SlideNavPiece([
				{ route: "end", page: {} },
				{ route: "start", page: parent }
			]);

		var child = { route: new Datum() };
		var childRouter = new RouterPiece(child);

		parentRouter.onBind(document.createElement("DIV"));
		childRouter.onBind(document.createElement("DIV"));

		assert.strictEqual(parentRouter.datumPiecesFirstPage, parent);
		assert.strictEqual(child.route(), "end");
	});

	QUnit.test("Slide nav piece in router piece", function(assert) {

		location.hash = "start/end";
		Route.reset();

		var parent = { route: new Datum() };
		var parentRouter = new RouterPiece(parent);

		var child = {};
		var childRouter =
			new SlideNavPiece([
				{ route: "start", page: {} },
				{ route: "end", page: child }
			]);

		parentRouter.onBind(document.createElement("DIV"));
		childRouter.onBind(document.createElement("DIV"));

		assert.strictEqual(parent.route(), "start");
		assert.strictEqual(childRouter.datumPiecesFirstPage, child);
	});

	QUnit.test("Router piece in nav piece", function(assert) {

		location.hash = "start/end";
		Route.reset();

		var parent = {};

		var parentRouter =
			new NavPiece([
				{ route: "end", page: {} },
				{ route: "start", page: parent }
			]);

		var child = { route: new Datum() };
		var childRouter = new RouterPiece(child);

		parentRouter.onBind(document.createElement("DIV"));
		childRouter.onBind(document.createElement("DIV"));

		assert.strictEqual(parentRouter.datumPiecesCurrentPage, parent);
		assert.strictEqual(child.route(), "end");
	});

	QUnit.test("Slide nav piece in router piece", function(assert) {

		location.hash = "start/end";
		Route.reset();

		var parent = { route: new Datum() };
		var parentRouter = new RouterPiece(parent);

		var child = {};
		var childRouter =
			new NavPiece([
				{ route: "start", page: {} },
				{ route: "end", page: child }
			]);

		parentRouter.onBind(document.createElement("DIV"));
		childRouter.onBind(document.createElement("DIV"));

		assert.strictEqual(parent.route(), "start");
		assert.strictEqual(childRouter.datumPiecesCurrentPage, child);
	});
});

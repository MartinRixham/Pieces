define([
	"qunit",
	"js/pieces/RouterPiece",
	"js/pieces/Route"
], function(
	QUnit,
	RouterPiece,
	Route) {

	QUnit.module("Router Piece");

	QUnit.testStart(function() {

		location.hash = "";
		new Route().reset();
	});

	QUnit.test("Show router page", function(assert) {

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		assert.strictEqual(router.page, page);
	});

	QUnit.test("Set route on hash change", function(assert) {

		var done = assert.async();

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));

		location.hash = "giraffe";

		setTimeout(function() {

			assert.strictEqual(page.route(), "giraffe");

			done();
		});
	});

	QUnit.test("Set route on bind", function(assert) {

		location.hash = "goat";

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));

		assert.strictEqual(page.route(), "goat");
	});

	QUnit.test("Update hash", function(assert) {

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));

		page.route("tiger");

		router.route().update();

		assert.strictEqual(location.hash, "#tiger");
	});

	QUnit.test("Route is string property", function(assert) {

		var done = assert.async();

		location.hash = "goat";

		var page = { route: "" };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));

		assert.strictEqual(page.route, "goat");

		page.route = "tiger";

		router.route().update();

		assert.strictEqual(location.hash, "#tiger");

		location.hash = "giraffe";

		setTimeout(function() {

			assert.strictEqual(page.route, "giraffe");

			done();
		});
	});

	QUnit.test("Nested routers", function(assert) {

		location.hash = "start/end";

		var parent = { route: new Datum() };
		var parentRouter = new RouterPiece(parent);

		var child = { route: new Datum() };
		var childRouter = new RouterPiece(child);

		parentRouter.onBind(document.createElement("DIV"));
		childRouter.onBind(document.createElement("DIV"));

		assert.strictEqual(parent.route(), "start");
		assert.strictEqual(child.route(), "end");
	});
});

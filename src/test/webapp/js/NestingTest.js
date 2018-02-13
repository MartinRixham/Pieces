define([
	"qunit",
	"js/pieces/RouterPiece",
	"js/pieces/SlideNavPiece",
	"js/pieces/Route"
], function(
	QUnit,
	RouterPiece,
	SlideNavPiece,
	Route) {

	QUnit.module("Nesting");

	QUnit.testStart(function() {

		location.hash = "";
		new Route().reset();
	});

	QUnit.test("Nested routers", function(assert) {

		location.hash = "start/end";

		var parent = {};
		var parentRouter = new SlideNavPiece([{ route: "start", page: parent }]);

		var child = { route: new Datum() };
		var childRouter = new RouterPiece(child);

		parentRouter.onBind(document.createElement("DIV"));
		childRouter.route().init();

		assert.strictEqual(parentRouter.firstPage, parent);
		assert.strictEqual(child.route(), "end");
	});
});

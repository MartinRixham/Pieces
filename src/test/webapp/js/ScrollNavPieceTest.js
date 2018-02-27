define([
	"qunit",
	"js/pieces/ScrollNavPiece",
	"js/pieces/NavButton",
	"js/pieces/Route"
], function(
	QUnit,
	ScrollNavPiece,
	NavButton,
	Route) {

	QUnit.module("Scroll Nav Piece");

	QUnit.testStart(function() {

		location.hash = "";
		new Route().reset();
	});

	QUnit.test("Nav with two pages", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		var nav =
			new ScrollNavPiece([
				{ route: "path", page: pageOne },
				{ route: "route", page: pageTwo }]);

		assert.strictEqual(nav.pages[0], pageOne);
		assert.strictEqual(nav.pages[1], pageTwo);

		assert.strictEqual(nav.getCurrentIndex(), -1);
	});

	QUnit.test("Click on first button", function(assert) {

		var page = {};
		var container = document.createElement("DIV");
		var nav = new ScrollNavPiece([{ route: "route", page: page }]);
		var button = new NavButton(0, nav)();

		nav.onBind(container);

		assert.ok(!button.classes.active());

		button.click();

		assert.strictEqual(nav.pages[0], page);
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});
});

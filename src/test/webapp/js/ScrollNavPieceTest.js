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

	QUnit.test("Nav with one page", function(assert) {

		var page = {};
		var nav = new ScrollNavPiece([{ route: "route", page: page }]);

		assert.strictEqual(nav.pages[0], page);
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});
});


define([
	"qunit",
	"js/pieces/NavPiece",
	"js/pieces/NavButton",
	"js/pieces/Route"
], function(
	QUnit,
	NavPiece,
	NavButton,
	Route) {

	QUnit.module("Scroll Nav Piece");

	QUnit.testStart(function() {

		location.hash = "";
		new Route().reset();
	});

	QUnit.test("Nav with one page", function(assert) {

		var page = {};
		var nav = new NavPiece([{ route: "route", page: page }]);

		nav.route().init();

		assert.strictEqual(nav.currentPage, page);
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});
});


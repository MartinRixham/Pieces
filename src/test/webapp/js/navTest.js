require(["qunit", "pieces/NavPiece"], function(QUnit, NavPiece) {

	QUnit.start();

	QUnit.test("Nav with one page", function(assert) {

		var page = {};
		var nav = new NavPiece([{ route: "route", page: page }]);

		assert.strictEqual(nav.currentPage, page);
	});
});


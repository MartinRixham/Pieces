define([
	"jquery",
	"js/pieces/SlideNavPiece",
	"js/cities/City",
	"js/Code"
], function(
	$,
	SlideNavPiece,
	City,
	Code) {

	function Cities() {

		this.onBind = function(element) {

			$(element).load("html/cities/cities.html");
		};

		this.cities =
			new SlideNavPiece([
				{
					route: "london",
					page: new City("photo-1505761671935-60b3a7427bad")
				},
				{
					route: "berlin",
					page: new City("photo-1559564484-e48b3e040ff4")
				},
				{
					route: "delhi",
					page: new City("photo-1513014576558-921f00d80b77")
				}
			]);

		this.code = new Code("cities/Cities.js");
	}

	return Cities;
});

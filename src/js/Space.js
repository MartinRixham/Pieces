define([
	"jquery",
	"js/Picture",
	"js/Code"
], function(
	$,
	Picture,
	Code) {

	function Space() {

		this.onBind = function(element) {

			$(element).load("html/space.html");
		};

		this.picture = new Picture("photo-1531306728370-e2ebd9d7bb99");

		this.code = new Code("Picture.js");
	}

	return Space;
});

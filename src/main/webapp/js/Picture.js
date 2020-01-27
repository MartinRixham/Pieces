define(["jquery"], function($) {

	var url = "https://images.unsplash.com/";

	var params =
		"?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=720&q=80";

	function Picture(id) {

		this.onBind = function(element) {

			$(element).load("html/picture.html");
		};

		this.image = new Init(function(element) {

			element.src = url + id + params;
		});
	}

	return Picture;
});

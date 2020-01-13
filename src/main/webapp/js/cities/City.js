define(["jquery"], function($) {

	var url = "https://images.unsplash.com/";

	var params =
		"?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=720&q=80";

	function City(id) {

		this.onBind = function(element) {

			$(element).load("html/cities/city.html");
		};

		this.image = new Init(function(element) {

			element.src = url + id + params;
		});
	}

	return City;
});

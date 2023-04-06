define([], function() {

	function Placeholder(page) {

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			for (var i = 0; i < page.length; i++) {

				element.appendChild(page[i]);
			}
		};
	}

	return Placeholder;
});

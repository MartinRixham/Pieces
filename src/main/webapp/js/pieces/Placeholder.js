define([], function() {

	function Placeholder(page) {

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			for (var j = 0; j < page.length; j++) {

				element.appendChild(page[j]);
			}
		};
	}

	return Placeholder;
});
